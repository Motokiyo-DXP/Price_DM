export function beginDeckInspectionSession<T extends object>(session: T): Omit<T, "mode"> & { mode: "deck" } {
  return { ...session, mode: "deck" } as Omit<T, "mode"> & { mode: "deck" };
}
