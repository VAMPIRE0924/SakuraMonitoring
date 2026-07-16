import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

import { BackIcon } from "../Icon";

export function ServerDetailChartLoading() {
	return (
		<div>
			<section className="grid md:grid-cols-2 lg:grid-cols-3 grid-cols-1 gap-3">
				<Skeleton className="h-[182px] w-full rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
				<Skeleton className="h-[182px] w-full rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
				<Skeleton className="h-[182px] w-full rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
				<Skeleton className="h-[182px] w-full rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
				<Skeleton className="h-[182px] w-full rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
				<Skeleton className="h-[182px] w-full rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
			</section>
		</div>
	);
}

export function ServerDetailLoading({
	embedded = false,
}: {
	embedded?: boolean;
}) {
	const navigate = useNavigate();

	return (
		<div className="mx-auto w-full max-w-5xl px-0">
			{embedded ? (
				<Skeleton className="h-[20px] w-24 rounded-[5px] bg-muted-foreground/10 animate-none" />
			) : (
				<button
					type="button"
					aria-label="Back"
					onClick={() => navigate("/")}
					className="flex flex-none cursor-pointer items-center gap-0.5 bg-transparent p-0 font-semibold text-xl leading-none tracking-tight"
				>
					<BackIcon />
					<Skeleton className="h-[20px] w-24 rounded-[5px] bg-muted-foreground/10 animate-none" />
				</button>
			)}
			<Skeleton className="flex flex-wrap gap-2 h-[81px] w-1/2 mt-3 rounded-[5px] bg-muted-foreground/10 animate-none"></Skeleton>
		</div>
	);
}
