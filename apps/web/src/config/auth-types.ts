export type PrimaryActor = "SR" | "MAHASISWA" | "ASUS" | "DITMAWA";

export type DepartmentCode =
  | "HCO"
  | "Adaptif"
  | "Sosial"
  | "Akademik"
  | "Spiritual"
  | "Media"
  | "RnD";

export type PositionCode = "KADIV" | "STAFF" | "INTI" | "ANGGOTA";

export interface UserProfile {
  id: string;
  nim: string;
  name: string;
  email: string;
  actor: PrimaryActor;
  departmentCode?: DepartmentCode;
  departmentName?: string;
  positionCode?: PositionCode;
  positionName?: string;
  buildingName?: string;
  avatarUrl?: string;
  isActive: boolean;
}

export interface UserRolePermissions {
  isHCO: boolean;
  isKadivHCO: boolean;
  canCreateEvent: boolean;
  canManageQR: boolean;
  canCloseEvent: boolean;
  canManualEntry: boolean;
  canExportReport: boolean;
}
