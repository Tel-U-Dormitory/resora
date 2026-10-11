"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import type { UserProfile, UserRolePermissions } from "./auth-types";

export const MOCK_PROFILES: Record<string, UserProfile> = {
  kadiv_hco: {
    id: "usr_hco_001",
    nim: "1301213001",
    name: "Fadhil Rahmat (KADIV HCO)",
    email: "fadhil.hco@telkomuniversity.ac.id",
    actor: "SR",
    departmentCode: "HCO",
    departmentName: "Human Capital & Organization",
    positionCode: "KADIV",
    positionName: "Ketua Divisi HCO",
    buildingName: "Gedung Asrama Utama",
    isActive: true,
  },
  staff_hco: {
    id: "usr_hco_002",
    nim: "1301213002",
    name: "Aisyah Putri (Staff HCO)",
    email: "aisyah.hco@telkomuniversity.ac.id",
    actor: "SR",
    departmentCode: "HCO",
    departmentName: "Human Capital & Organization",
    positionCode: "STAFF",
    positionName: "Staff HCO",
    buildingName: "Gedung Asrama Putri",
    isActive: true,
  },
  sr_adaptif: {
    id: "usr_adaptif_001",
    nim: "1301213055",
    name: "Nabil Fikry (Staff Adaptif)",
    email: "nabil.adaptif@telkomuniversity.ac.id",
    actor: "SR",
    departmentCode: "Adaptif",
    departmentName: "Divisi Adaptif & Hubungan Luar",
    positionCode: "STAFF",
    positionName: "Staff Adaptif",
    buildingName: "Gedung Asrama Putra",
    isActive: true,
  },
};

interface AuthContextValue {
  user: UserProfile;
  permissions: UserRolePermissions;
  currentRoleKey: string;
  switchRole: (roleKey: string) => void;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentRoleKey, setCurrentRoleKey] = useState<string>("kadiv_hco");
  const [user, setUser] = useState<UserProfile>(MOCK_PROFILES.kadiv_hco);
  const [isLoading, setIsLoading] = useState(false);

  // Load saved emulated role if available in local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("resora_emulated_role");
      if (saved && MOCK_PROFILES[saved]) {
        setCurrentRoleKey(saved);
        setUser(MOCK_PROFILES[saved]);
      }
    } catch {
      // fallback
    }
  }, []);

  const switchRole = (roleKey: string) => {
    if (MOCK_PROFILES[roleKey]) {
      setCurrentRoleKey(roleKey);
      setUser(MOCK_PROFILES[roleKey]);
      try {
        localStorage.setItem("resora_emulated_role", roleKey);
      } catch {
        // ignore
      }
    }
  };

  const permissions = useMemo<UserRolePermissions>(() => {
    const isHCO = user.actor === "SR" && user.departmentCode === "HCO";
    const isKadivHCO = isHCO && user.positionCode === "KADIV";

    return {
      isHCO,
      isKadivHCO,
      canCreateEvent: isHCO,
      canManageQR: isHCO,
      canCloseEvent: isHCO,
      canManualEntry: isKadivHCO, // Sesuai PRD: HANYA KADIV HCO yang boleh input/koreksi manual
      canExportReport: isHCO,
    };
  }, [user]);

  const logout = () => {
    try {
      authClient.signOut();
    } catch {
      // ignore
    }
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        currentRoleKey,
        switchRole,
        isLoading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
