import { useState, useEffect, useCallback, useMemo } from "react";
import { DatabaseMetadata } from "@/types/database";
import { getMetadata, refreshMetadata as apiRefreshMetadata, fetchExternalMetadata } from "@/lib/api";

type GroupedMetadata = Record<string, Record<string, DatabaseMetadata[]>>;

export function useMetadata() {
  const [metadata, setMetadata] = useState<DatabaseMetadata[]>([]);
  const [externalMetadata, setExternalMetadata] = useState<DatabaseMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      setIsLoading(true);
      const data = await getMetadata();
      setMetadata(data);
    } catch (error) {
      console.error("Failed to load metadata:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await apiRefreshMetadata();
      await loadMetadata();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const refreshExternal = useCallback(async () => {
    const data = await fetchExternalMetadata();
    setExternalMetadata(data);
  }, []);

  const groupedMetadata = useMemo<GroupedMetadata>(() => {
    const grouped: GroupedMetadata = {};

    for (const item of metadata) {
      if (!grouped[item.schema_name]) {
        grouped[item.schema_name] = {};
      }
      if (!grouped[item.schema_name][item.table_name]) {
        grouped[item.schema_name][item.table_name] = [];
      }
      grouped[item.schema_name][item.table_name].push(item);
    }

    return grouped;
  }, [metadata]);

  const externalGroupedMetadata = useMemo<GroupedMetadata>(() => {
    const grouped: GroupedMetadata = {};

    for (const item of externalMetadata) {
      if (!grouped[item.schema_name]) {
        grouped[item.schema_name] = {};
      }
      if (!grouped[item.schema_name][item.table_name]) {
        grouped[item.schema_name][item.table_name] = [];
      }
      grouped[item.schema_name][item.table_name].push(item);
    }

    return grouped;
  }, [externalMetadata]);

  return {
    metadata,
    externalMetadata,
    isLoading,
    isRefreshing,
    refresh,
    refreshExternal,
    groupedMetadata,
    externalGroupedMetadata,
  };
}
