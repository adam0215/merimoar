import { api } from "@merimoar/convex/api";
import { useQuery } from "convex/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";

export type CustomToolNameIndex = {
	byId: ReadonlyMap<string, string>;
	byRuntimeName: ReadonlyMap<string, string>;
};

const CustomToolNamesContext = createContext<CustomToolNameIndex | null>(null);

export function CustomToolNamesProvider({ children }: { children: ReactNode }) {
	const configuration = useQuery(
		api.agent.customTools.listWorkspaceConfiguration,
		{},
	);
	const names = useMemo(() => {
		const tools =
			configuration?.flatMap((integration) => integration.tools) ?? [];
		return {
			byId: new Map(tools.map((tool) => [tool._id, tool.name])),
			byRuntimeName: new Map(
				tools.map((tool) => [tool.normalizedName, tool.name]),
			),
		};
	}, [configuration]);

	return (
		<CustomToolNamesContext.Provider value={names}>
			{children}
		</CustomToolNamesContext.Provider>
	);
}

export function useCustomToolNames() {
	const names = useContext(CustomToolNamesContext);
	if (!names) {
		throw new Error("Custom tool names require CustomToolNamesProvider.");
	}
	return names;
}
