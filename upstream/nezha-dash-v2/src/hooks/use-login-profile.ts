import { useQuery } from "@tanstack/react-query";
import { fetchLoginUser, isAuthenticatedProfile } from "@/lib/nezha-api";

const LOGIN_PROFILE_REFRESH_MS = 30_000;

export function useLoginProfile(enabled = true) {
	const query = useQuery({
		queryKey: ["login-user"],
		queryFn: ({ signal }) => fetchLoginUser(signal),
		enabled,
		refetchOnMount: false,
		refetchOnWindowFocus: true,
		refetchIntervalInBackground: true,
		refetchInterval: LOGIN_PROFILE_REFRESH_MS,
		retry: 0,
	});

	return {
		...query,
		isLogin: isAuthenticatedProfile(query.data, query.error),
	};
}
