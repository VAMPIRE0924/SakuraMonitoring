// This probe is only for the disposable loopback dashboard used by release validation.
// It registers legacy and GPU-memory agents, with no reconnect/retry to hide failures.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
	pb "github.com/nezhahq/nezha/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

func main() {
	if err := probe(); err != nil {
		log.Fatal(err)
	}
}

func probe() error {
	if len(os.Args) != 2 {
		return fmt.Errorf("usage: check-agent-stream.go loopback-host:port")
	}
	address := os.Args[1]
	host, _, err := net.SplitHostPort(address)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		return fmt.Errorf("probe requires an explicit loopback IP")
	}
	secret := os.Getenv("SAKURA_SMOKE_AGENT_SECRET")
	if secret == "" {
		return fmt.Errorf("missing disposable smoke agent secret")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	connection, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return err
	}
	defer connection.Close()
	client := pb.NewNezhaServiceClient(connection)
	errors := make(chan error, 4)
	states := make([]grpc.BidiStreamingClient[pb.State, pb.Receipt], 0, 2)
	for index, uuid := range []string{
		"5a05b97e-36d2-4dda-8b62-90503bf00101",
		"5a05b97e-36d2-4dda-8b62-90503bf00102",
	} {
		auth := metadata.AppendToOutgoingContext(ctx, "client-secret", secret, "client-uuid", uuid)
		info, err := client.ReportSystemInfo2(auth, &pb.Host{
			Platform: "linux", Cpu: []string{"release smoke CPU"}, Gpu: []string{"release smoke GPU"},
			MemTotal: 8 << 30, DiskTotal: 40 << 30, Arch: "amd64", Version: "release-smoke",
		})
		if err != nil {
			return fmt.Errorf("agent %d host report: %w", index, err)
		}
		if info.GetData() == 0 {
			return fmt.Errorf("host report did not return dashboard boot time")
		}
		tasks, err := client.RequestTask(auth)
		if err != nil {
			return err
		}
		if err := tasks.Send(&pb.TaskResult{}); err != nil {
			return err
		}
		go func() {
			for {
				if _, err := tasks.Recv(); err != nil {
					errors <- fmt.Errorf("RequestTask disconnected: %w", err)
					return
				}
			}
		}()
		stream, err := client.ReportSystemState(auth)
		if err != nil {
			return err
		}
		states = append(states, stream)
	}
	send := func() error {
		for index, stream := range states {
			state := &pb.State{Cpu: 25, MemUsed: 1 << 30, Uptime: 60, Gpu: []float64{25}}
			if index == 1 {
				state.Gpus = []*pb.State_GPU{{Utilization: 25, MemoryUsed: 4096, MemoryTotal: 16384}}
			}
			if err := stream.Send(state); err != nil {
				return fmt.Errorf("agent %d state send: %w", index, err)
			}
			if receipt, err := stream.Recv(); err != nil || !receipt.GetProced() {
				return fmt.Errorf("agent %d state receipt failed: %v", index, err)
			}
		}
		return nil
	}
	if err := send(); err != nil {
		return err
	}
	ws, response, err := websocket.DefaultDialer.DialContext(ctx, "ws://"+address+"/api/v1/ws/server", nil)
	if response != nil && response.Body != nil {
		defer response.Body.Close()
	}
	if err != nil {
		return fmt.Errorf("public websocket: %w", err)
	}
	defer ws.Close()
	ws.SetReadDeadline(time.Now().Add(40 * time.Second))
	frames := make(chan int, 1)
	serverIDs := make(chan uint64, 1)
	go func() {
		count := 0
		for {
			var snapshot struct {
				Servers []struct {
					ID         uint64    `json:"id"`
					LastActive time.Time `json:"last_active"`
					Host       struct {
						CPU []string `json:"cpu"`
					} `json:"host"`
					State struct {
						GPUs []struct {
							MemoryUsed  uint64 `json:"memory_used"`
							MemoryTotal uint64 `json:"memory_total"`
						} `json:"gpus"`
					} `json:"state"`
				} `json:"servers"`
			}
			_, payload, err := ws.ReadMessage()
			if err != nil {
				errors <- fmt.Errorf("public websocket disconnected: %w", err)
				return
			}
			if err := json.Unmarshal(payload, &snapshot); err != nil {
				errors <- err
				return
			}
			seen, modern := 0, false
			for _, server := range snapshot.Servers {
				if len(server.Host.CPU) == 0 || server.Host.CPU[0] != "release smoke CPU" {
					continue
				}
				seen++
				select {
				case serverIDs <- server.ID:
				default:
				}
				if server.LastActive.IsZero() || time.Since(server.LastActive) > 6*time.Second {
					errors <- fmt.Errorf("agent %d became offline or stopped reporting", server.ID)
					return
				}
				if len(server.State.GPUs) > 0 {
					modern = server.State.GPUs[0].MemoryUsed == 4096 && server.State.GPUs[0].MemoryTotal == 16384
				}
			}
			if seen != 2 || !modern {
				errors <- fmt.Errorf("websocket lost agents or GPU memory contract")
				return
			}
			count++
			select {
			case <-frames:
			default:
			}
			frames <- count
		}
	}()
	for tick := 0; tick < 30; tick++ {
		select {
		case err := <-errors:
			return err
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
		if err := send(); err != nil {
			return err
		}
	}
	select {
	case err := <-errors:
		return err
	default:
	}
	select {
	case count := <-frames:
		if count < 5 {
			return fmt.Errorf("insufficient websocket samples: %d", count)
		}
		fmt.Printf("Agent stream probe passed: two agents, 30 seconds, %d online/GPU websocket frames, no reconnects\n", count)
		serverID := <-serverIDs
		request, err := http.NewRequestWithContext(ctx, http.MethodGet,
			fmt.Sprintf("http://%s/api/v1/server/%d/online-history?days=1", address, serverID), nil)
		if err != nil {
			return err
		}
		response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
		if err != nil {
			return err
		}
		defer response.Body.Close()
		var history struct {
			Success bool `json:"success"`
			Data    struct {
				ServerID uint64 `json:"server_id"`
				Days     int    `json:"days"`
				Online   bool   `json:"currently_online"`
				Periods  []struct {
					Ongoing bool `json:"ongoing"`
				} `json:"periods"`
			} `json:"data"`
		}
		if err := json.NewDecoder(response.Body).Decode(&history); err != nil {
			return err
		}
		if response.StatusCode != http.StatusOK || !history.Success || history.Data.ServerID != serverID ||
			history.Data.Days != 1 || !history.Data.Online || len(history.Data.Periods) == 0 ||
			!history.Data.Periods[len(history.Data.Periods)-1].Ongoing {
			return fmt.Errorf("online history lost the live agent session")
		}
		fmt.Println("Online history probe passed: guest one-day window and ongoing agent session")
	default:
		return fmt.Errorf("no public websocket samples")
	}
	return nil
}
