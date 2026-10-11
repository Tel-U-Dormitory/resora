"use client";

import React, { useState, useMemo } from "react";
import { SearchNormal1, ArrowDown2, ArrowUp2, TickCircle } from "iconsax-react";
import { cn } from "@/lib/utils";

// Subkomponen internal mandiri (zero external UI dependencies) agar data-table 100% modular
function TableAvatar({ src, name }: { src: string; name: string }) {
  const [hasError, setHasError] = useState(false);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative size-10 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-muted/70 flex items-center justify-center font-bold text-xs text-foreground shadow-2xs">
      {!hasError && src ? (
        <img
          src={src}
          alt={name}
          onError={() => setHasError(true)}
          className="size-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function TableStatusBadge({ status }: { status: "Aktif" | "Review" | "Cuti" }) {
  const styles = {
    Aktif: "bg-success-soft text-success border-success/20",
    Review: "bg-warning-soft text-warning border-warning/20",
    Cuti: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
        styles
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function TableDetailButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-muted active:scale-95 cursor-pointer"
    >
      {children}
    </button>
  );
}

export interface TableRowData {
  id: number;
  name: string;
  role: string;
  department: string;
  status: "Aktif" | "Review" | "Cuti";
  avatar: string;
  campus: string;
}

const INITIAL_ROWS: TableRowData[] = [
  {
    id: 1,
    name: "Hart Hagerty",
    role: "Desktop Support Specialist",
    department: "Pusat Teknologi Informasi",
    status: "Aktif",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    campus: "Bandung Techno Park",
  },
  {
    id: 2,
    name: "Brice Swyre",
    role: "Financial Accountant",
    department: "Direktorat Keuangan",
    status: "Review",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
    campus: "Kampus Utama",
  },
  {
    id: 3,
    name: "Marjy Ferencz",
    role: "Lead UI/UX Designer",
    department: "SIASTRA Digital Lab",
    status: "Aktif",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80",
    campus: "Gedung Cacuk",
  },
  {
    id: 4,
    name: "Yancy Tear",
    role: "Research Specialist",
    department: "Fakultas Informatika",
    status: "Cuti",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
    campus: "Kampus Jakarta",
  },
];

/**
 * DataTable — tabel data interaktif dengan pencarian, pemilihan baris, avatar squircle, dan badge.
 */
export function DataTable({
  data = INITIAL_ROWS,
  className,
}: {
  data?: TableRowData[];
  className?: string;
}) {
  const [selectedRows, setSelectedRows] = useState<number[]>([1]);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "department">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    return data
      .filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.department.toLowerCase().includes(search.toLowerCase()) ||
          r.role.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const valA = a[sortField].toLowerCase();
        const valB = b[sortField].toLowerCase();
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [data, search, sortField, sortOrder]);

  const toggleRow = (id: number) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedRows.length === filtered.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filtered.map((r) => r.id));
    }
  };

  const handleSort = (field: "name" | "department") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className={cn("w-full space-y-3", className)}>
      {/* Search and control bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <SearchNormal1
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pegawai atau divisi..."
            className="w-full h-10 pl-9 pr-3 text-xs bg-surface border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground self-end sm:self-center">
          <span>{selectedRows.length} dari {filtered.length} dipilih</span>
        </div>
      </div>

      {/* Table container */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedRows.length === filtered.length}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSort("name")}
                  className="py-3.5 px-3 cursor-pointer select-none hover:text-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Pegawai</span>
                    {sortField === "name" &&
                      (sortOrder === "asc" ? <ArrowUp2 size={12} /> : <ArrowDown2 size={12} />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("department")}
                  className="py-3.5 px-3 cursor-pointer select-none hover:text-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Divisi & Peran</span>
                    {sortField === "department" &&
                      (sortOrder === "asc" ? <ArrowUp2 size={12} /> : <ArrowDown2 size={12} />)}
                  </div>
                </th>
                <th className="py-3.5 px-3">Kampus</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="p-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs font-medium text-slate-700">
              {filtered.map((row) => {
                const isSelected = selectedRows.includes(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-muted/40 transition-colors",
                      isSelected && "bg-primary-soft/30"
                    )}
                  >
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <TableAvatar src={row.avatar} name={row.name} />
                        <div>
                          <p className="font-bold text-foreground text-xs">{row.name}</p>
                          <p className="text-[11px] text-muted-foreground">ID: TU-2026-00{row.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-foreground">{row.role}</p>
                      <p className="text-[11px] text-muted-foreground">{row.department}</p>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">{row.campus}</td>
                    <td className="py-3 px-3">
                      <TableStatusBadge status={row.status} />
                    </td>
                    <td className="p-3.5 text-right">
                      <TableDetailButton>
                        Detail
                      </TableDetailButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * TimelineMilestone — alur tahapan pencapaian kegiatan atau registrasi.
 */
export function TimelineMilestone({
  milestones = [
    {
      step: "Fase 1",
      title: "Pendaftaran Online",
      desc: "Pengisian biodata & tes minat bakat digital.",
      completed: true,
    },
    {
      step: "Fase 2",
      title: "Verifikasi Berkas",
      desc: "Validasi rapor dan portofolio prestasi akademik.",
      completed: true,
    },
    {
      step: "Fase 3",
      title: "Pengumuman Hasil",
      desc: "Pemberitahuan kelulusan jalur prestasi & beasiswa.",
      completed: true,
    },
    {
      step: "Fase 4",
      title: "Registrasi Ulang",
      desc: "Konfirmasi penerimaan & pembuatan nomor induk.",
      completed: false,
    },
  ],
}: {
  milestones?: { step: string; title: string; desc: string; completed: boolean }[];
}) {
  return (
    <div className="w-full py-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative">
        {milestones.map((item, index) => (
          <div
            key={index}
            className="flex-1 flex flex-col items-center text-center relative group w-full"
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-all duration-300 z-10",
                item.completed
                  ? "bg-primary text-white shadow-brand"
                  : "bg-muted text-muted-foreground border border-border"
              )}
            >
              {item.completed ? (
                <TickCircle size={22} variant="Bold" className="text-white" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>

            {index < milestones.length - 1 && (
              <div
                className={cn(
                  "hidden sm:block absolute top-5 left-1/2 w-full h-0.5 -z-0 transition-colors",
                  item.completed ? "bg-primary" : "bg-border"
                )}
              />
            )}

            <div className="mt-3 p-3 rounded-xl bg-surface border border-border shadow-xs w-full max-w-[200px]">
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-wider">
                {item.step}
              </span>
              <h5 className="font-bold text-xs text-foreground mt-0.5">{item.title}</h5>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
