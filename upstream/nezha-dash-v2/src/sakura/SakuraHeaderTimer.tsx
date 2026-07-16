import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function getGreetingPeriod(date: Date) {
	const hour = date.getHours();
	if (hour >= 5 && hour < 11) return "morning";
	if (hour >= 11 && hour < 13) return "noon";
	if (hour >= 13 && hour < 18) return "afternoon";
	return "evening";
}

function getClockState() {
	const date = new Date();

	return {
		hh: date.getHours(),
		mm: date.getMinutes(),
		ss: date.getSeconds(),
		greetingPeriod: getGreetingPeriod(date),
	};
}

function useOverviewClock() {
	const [clockState, setClockState] = useState(getClockState);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setClockState(getClockState());
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, []);

	return clockState;
}

export default function SakuraHeaderTimer() {
	const { t } = useTranslation();
	const { hh, mm, ss, greetingPeriod } = useOverviewClock();
	const greeting = `👋 ${t(`greeting.${greetingPeriod}`)}`;
	const clockText = [hh, mm, ss]
		.map((value) => value.toString().padStart(2, "0"))
		.join(":");

	return (
		<section className="header-timer">
			<p className="nz-overview-greeting">{greeting}</p>
			<p className="nz-overview-clock">
				<span>{t("whereTheTimeIs")}</span>
				<time className="sakura-clock-digits" dateTime={clockText}>
					{clockText}
				</time>
			</p>
		</section>
	);
}
