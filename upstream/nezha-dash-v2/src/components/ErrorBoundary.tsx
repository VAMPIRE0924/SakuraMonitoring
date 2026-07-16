import React from "react";

import ErrorPage from "../pages/ErrorPage";

interface Props {
	children: React.ReactNode;
}

interface State {
	hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	render() {
		if (this.state.hasError) {
			return <ErrorPage code={500} />;
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
