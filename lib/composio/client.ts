import { supabase } from "@/lib/supabase/client";

export async function composioExecute<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("composio", { body: { tool, arguments: args } });
  if (error) throw error;
  return data as T;
}
