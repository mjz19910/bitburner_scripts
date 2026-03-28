export type Compute<T> = { [U in keyof T]: T[U] } & {}
export type DarknetServer = Compute<{ isOnline: boolean } & DarknetServerData>
