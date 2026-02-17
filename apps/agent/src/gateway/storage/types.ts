export interface MountPoint {
	path: string
	readOnly: boolean
}

export interface StorageMountConfig {
	documents: MountPoint
	artifacts: MountPoint
}

export const DEFAULT_MOUNTS: StorageMountConfig = {
	documents: { path: "/documents", readOnly: true },
	artifacts: { path: "/artifacts", readOnly: false },
}
