import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Home,
  Inbox,
  UserCheck,
  LayoutGrid,
  QrCode,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Search,
  SlidersHorizontal,
  X,
  Copy,
  Check,
  Plus,
  Users,
  Award,
  Shield,
  CalendarRange,
  ArrowLeft,
  CameraOff,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  BarChart3,
  Table as TableIcon,
  Trash2,
  Lock,
  Megaphone,
  Smartphone,
  Monitor,
  TrendingUp,
  Bell,
  Sparkles,
  FileWarning,
  ClipboardCheck
} from 'lucide-react';

// ============================================================================
// SYNTHETIC DATA & CONSTANTS (RESORA Design System 1.0 - WIB / id-ID)
// ============================================================================

const ROLES = [
  { id: 'ANGGOTA', label: 'Anggota', desc: 'Senior Resident · Gedung 10' },
  { id: 'PENGURUS', label: 'Pengurus', desc: 'Koordinator Operasional · Gedung 10' },
  { id: 'SYSTEM_ADMIN', label: 'Admin', desc: 'Administrator Sistem (Non-Peserta SR)' }
];

const WEEKLY_ATTENDANCE_DATA = [
  { day: 'Sen', fullDay: 'Senin', count: 38, target: 45, rate: 84.4 },
  { day: 'Sel', fullDay: 'Selasa', count: 42, target: 45, rate: 93.3 },
  { day: 'Rab', fullDay: 'Rabu', count: 35, target: 45, rate: 77.8 },
  { day: 'Kam', fullDay: 'Kamis', count: 46, target: 48, rate: 95.8 },
  { day: 'Jum', fullDay: 'Jumat', count: 52, target: 54, rate: 96.3 },
  { day: 'Sab', fullDay: 'Sabtu', count: 44, target: 48, rate: 91.7 },
  { day: 'Min', fullDay: 'Minggu', count: 41, target: 45, rate: 91.1 }
];

const TREND_COMPARISON_DATA = [
  { label: 'M1', current: 84, previous: 78 },
  { label: 'M2', current: 88, previous: 81 },
  { label: 'M3', current: 86, previous: 83 },
  { label: 'M4', current: 93, previous: 82 },
  { label: 'M5', current: 91, previous: 85 },
  { label: 'M6', current: 95, previous: 84 },
  { label: 'M7', current: 97, previous: 88 }
];

const PUNCTUALITY_SPLINE_DATA = [
  { day: 'Sen', pct: 74, onTime: 28 },
  { day: 'Sel', pct: 82, onTime: 34 },
  { day: 'Rab', pct: 79, onTime: 29 },
  { day: 'Kam', pct: 88, onTime: 40 },
  { day: 'Jum', pct: 91, onTime: 47 },
  { day: 'Sab', pct: 85, onTime: 37 },
  { day: 'Min', pct: 89, onTime: 36 }
];

const STATUS_DISTRIBUTION = [
  { id: 'hadir', label: 'Hadir Tepat Waktu', pct: 78, count: 142, type: 'success', fill: '#FF6F6F' },
  { id: 'terlambat', label: 'Terlambat', pct: 14, count: 25, type: 'warning', fill: '#FFF46E' },
  { id: 'izin', label: 'Izin Resmi', pct: 8, count: 15, type: 'info', fill: '#A58BFF' }
];

const UPCOMING_EVENTS = [
  {
    id: 'evt-1',
    title: 'Rapat Koordinasi Gedung 10',
    dateLabel: '26 Nov 2026, 19.00 WIB',
    location: 'Aula Lantai 1, Gedung 10',
    category: 'Wajib',
    status: 'Berlangsung',
    statusType: 'info',
    radius: '20 m',
    organizer: 'Departemen Operasional',
    description:
      'Pembahasan jadwal piket akhir bulan, evaluasi ketertiban koridor, serta persiapan agenda evaluasi periode 2026/2027.'
  },
  {
    id: 'evt-2',
    title: 'Apel Pagi Asrama',
    dateLabel: '27 Nov 2026, 06.15 WIB',
    location: 'Lapangan Utama Asrama Putra',
    category: 'Asrama',
    status: 'Terjadwal',
    statusType: 'neutral',
    radius: '35 m',
    organizer: 'Pengurus Harian Asrama',
    description:
      'Apel rutin mingguan seluruh penghuni asrama dan Senior Resident. Pastikan kamu sudah berada di area lapangan 5 menit sebelumnya.'
  },
  {
    id: 'evt-3',
    title: 'Workshop Kebersihan & Tata Ruang',
    dateLabel: '29 Nov 2026, 09.00 WIB',
    location: 'Ruang Serbaguna Gedung 8',
    category: 'Kepanitiaan',
    status: 'Terjadwal',
    statusType: 'neutral',
    radius: '25 m',
    organizer: 'Divisi Lingkungan & K3',
    description:
      'Sosialisasi standar penilaian kebersihan kamar dan simulasi pelaporan fasilitas rusak secara terstruktur.'
  },
  {
    id: 'evt-4',
    title: 'Evaluasi Bulanan Senior Resident',
    dateLabel: '02 Des 2026, 20.00 WIB',
    location: 'Ruang Rapat B, Gedung 10',
    category: 'Wajib',
    status: 'Terjadwal',
    statusType: 'neutral',
    radius: '15 m',
    organizer: 'Ketua Umum Asrama',
    description:
      'Peninjauan capaian kehadiran bulanan dan distribusi tugas kepanitiaan untuk bulan Desember 2026.'
  }
];

const ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    title: 'Pembaruan Radius Geofence Area Gedung 10',
    category: 'Wajib',
    dateLabel: '26 Nov 2026, 08.15 WIB',
    sender: 'Pengurus Operasional',
    summary:
      'Radius validasi absensi QR untuk kegiatan di Aula Lantai 1 disesuaikan menjadi 20 meter agar akurasi lokasi lebih stabil.',
    body: 'Halo kamu! Mulai hari ini pukul 12.00 WIB, radius geofence untuk seluruh kegiatan di Aula Lantai 1 Gedung 10 ditetapkan sebesar 20 meter. Jika perangkat kamu mengalami kendala sinyal GPS di dalam ruangan, silakan geser mendekati area jendela atau teras aula lalu klik Perbarui lokasi sebelum mencoba scan ulang.'
  },
  {
    id: 'ann-2',
    title: 'Jadwal Pemeliharaan Air Bersih Gedung 9 & 10',
    category: 'Asrama',
    dateLabel: '25 Nov 2026, 17.40 WIB',
    sender: 'Divisi Sarana & Prasarana',
    summary:
      'Akan dilakukan pengurasan tandon air utama pada hari Sabtu pukul 13.00 sampai 15.30 WIB. Mohon menampung air secukupnya.',
    body: 'Dalam rangka menjaga kualitas air bersih asrama, tim teknis akan melakukan pengurasan dan pengecekan pompa di Gedung 9 dan Gedung 10 pada Sabtu, 28 Nov 2026 pukul 13.00 hingga 15.30 WIB. Selama proses berlangsung, aliran air akan dihentikan sementara.'
  },
  {
    id: 'ann-3',
    title: 'Rekrutmen Panitia Malam Keakraban 2026',
    category: 'Kepanitiaan',
    dateLabel: '24 Nov 2026, 14.20 WIB',
    sender: 'Departemen Acara',
    summary:
      'Pendaftaran anggota kepanitiaan divisi logistik, acara, dan dokumentasi dibuka hingga 30 Nov 2026 pukul 23.59 WIB.',
    body: 'Buat kamu yang ingin berkontribusi di Malam Keakraban Periode 2026/2027, pendaftaran panitia resmi dibuka. Keikutsertaan aktif akan tercatat di modul Kepanitiaan dan menambah rekap poin kegiatan sesuai ketentuan periode berjalan.'
  },
  {
    id: 'ann-4',
    title: 'Ketentuan Jam Malam & Akses Gerbang Utama',
    category: 'Wajib',
    dateLabel: '22 Nov 2026, 20.00 WIB',
    sender: 'Keamanan Asrama',
    summary:
      'Gerbang utama asrama ditutup tepat pukul 22.30 WIB. Izin keterlambatan wajib diajukan sebelum pukul 21.00 WIB.',
    body: 'Mengingatkan kembali kepada seluruh anggota bahwa akses gerbang utama ditutup pukul 22.30 WIB. Bagi kamu yang memiliki kegiatan akademik atau organisasi melewati batas waktu tersebut, pastikan sudah melapor ke pengurus piket.'
  },
  {
    id: 'ann-5',
    title: 'Pengecekan Rutin Alat Pemadam Api Ringan (APAR)',
    category: 'Asrama',
    dateLabel: '20 Nov 2026, 10.05 WIB',
    sender: 'Divisi Lingkungan & K3',
    summary:
      'Tim K3 akan melakukan inspeksi lorong lantai 1 sampai 4 pada hari Senin pagi. Tidak perlu mengosongkan kamar.',
    body: 'Inspeksi rutin keselamatan gedung akan dilaksanakan pada Senin, 30 Nov 2026 mulai pukul 08.30 WIB. Pastikan lorong di depan kamar tidak terhalang barang pribadi atau jemuran.'
  },
  {
    id: 'ann-6',
    title: 'Rekap Poin Kegiatan Triwulan I Sudah Tersedia',
    category: 'Kepanitiaan',
    dateLabel: '18 Nov 2026, 16.00 WIB',
    sender: 'Sekretaris Organisasi',
    summary:
      'Kamu sudah bisa melihat rincian poin kegiatan periode September sampai November 2026 melalui menu Apps lalu Rekap Poin.',
    body: 'Rekapitulasi poin kegiatan untuk seluruh anggota telah diperbarui berdasarkan data absensi terkonfirmasi. Bila terdapat ketidaksesuaian catatan, silakan sampaikan ke pengurus departemen terkait disertai ID diagnosis absensi kamu.'
  }
];

const ATTENDANCE_HISTORY = [
  {
    id: 'att-1',
    eventTitle: 'Rapat Evaluasi Mingguan Gedung 10',
    dateLabel: '19 Nov 2026, 19.06 WIB',
    status: 'Hadir',
    statusType: 'success',
    location: 'Aula Lantai 1, Gedung 10',
    diagnosis: `Diagnosis lokasi RESORA
Waktu: 19/11/2026 19:06 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: CHECKIN_CONFIRMED
Permission: granted
Akurasi GPS: 9 m
Umur sampel: 142 ms
Durasi pengambilan: 1840 ms
Jarak server: 12 m
Radius event: 20 m
Selisih batas: -8 m
Percobaan: 1
ID diagnosis: LOC-CONF-209
Koordinat presisi: tidak disertakan.`
  },
  {
    id: 'att-2',
    eventTitle: 'Apel Pagi Asrama',
    dateLabel: '14 Nov 2026, 06.24 WIB',
    status: 'Terlambat',
    statusType: 'warning',
    location: 'Lapangan Utama Asrama Putra',
    diagnosis: `Diagnosis lokasi RESORA
Waktu: 14/11/2026 06:24 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: CHECKIN_LATE_CONFIRMED
Permission: granted
Akurasi GPS: 14 m
Umur sampel: 210 ms
Durasi pengambilan: 2210 ms
Jarak server: 18 m
Radius event: 35 m
Selisih batas: -17 m
Percobaan: 1
ID diagnosis: LOC-LATE-114
Koordinat presisi: tidak disertakan.`
  },
  {
    id: 'att-3',
    eventTitle: 'Kerja Bakti Lingkungan Gedung',
    dateLabel: '08 Nov 2026, 07.30 WIB',
    status: 'Hadir',
    statusType: 'success',
    location: 'Taman Tengah Gedung 10',
    diagnosis: `Diagnosis lokasi RESORA
Waktu: 08/11/2026 07:30 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: CHECKIN_CONFIRMED
Permission: granted
Akurasi GPS: 8 m
Umur sampel: 115 ms
Durasi pengambilan: 1490 ms
Jarak server: 6 m
Radius event: 25 m
Selisih batas: -19 m
Percobaan: 1
ID diagnosis: LOC-CONF-088
Koordinat presisi: tidak disertakan.`
  },
  {
    id: 'att-4',
    eventTitle: 'Diskusi Terbuka Senior Resident',
    dateLabel: '02 Nov 2026, 19.45 WIB',
    status: 'Izin',
    statusType: 'info',
    location: 'Ruang Serbaguna Gedung 8',
    diagnosis: `Diagnosis lokasi RESORA
Waktu: 02/11/2026 19:45 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: EXCUSED_APPROVED
Permission: Tidak tersedia
Akurasi GPS: Tidak tersedia
Umur sampel: Tidak tersedia
Durasi pengambilan: Tidak tersedia
Jarak server: Tidak tersedia
Radius event: 25 m
Selisih batas: Tidak tersedia
Percobaan: Tidak tersedia
ID diagnosis: LOC-EXCU-041
Koordinat presisi: tidak disertakan.`
  }
];

const OUTSIDE_GEOFENCE_DIAGNOSIS = `Diagnosis lokasi RESORA
Waktu: 26/11/2026 12:35 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: OUTSIDE_GEOFENCE
Permission: granted
Akurasi GPS: 11 m
Umur sampel: 198 ms
Durasi pengambilan: 3017 ms
Jarak server: 22 m
Radius event: 20 m
Selisih batas: +2 m
Percobaan: 3
ID diagnosis: LOC-EXAMPLE-001
Koordinat presisi: tidak disertakan.`;

const SUCCESS_SCAN_DIAGNOSIS = `Diagnosis lokasi RESORA
Waktu: 26/11/2026 12:35 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: CHECKIN_CONFIRMED
Permission: granted
Akurasi GPS: 10 m
Umur sampel: 154 ms
Durasi pengambilan: 1890 ms
Jarak server: 14 m
Radius event: 20 m
Selisih batas: -6 m
Percobaan: 1
ID diagnosis: LOC-CONF-904
Koordinat presisi: tidak disertakan.`;

const DRAFT_STORAGE_KEY = 'resora_draft_v1_create_event_nafi';

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

/**
 * StatusBadge: Strictly pairs icon + text using high-contrast WCAG AA tokens.
 */
function StatusBadge({ type = 'neutral', children }) {
  const config = {
    success: { icon: CheckCircle2, colorVar: 'var(--success-text)', bgVar: 'var(--success-tint)' },
    warning: { icon: AlertTriangle, colorVar: 'var(--warning-text)', bgVar: 'var(--warning-tint)' },
    danger: { icon: XCircle, colorVar: 'var(--danger-text)', bgVar: 'var(--danger-tint)' },
    info: { icon: Info, colorVar: 'var(--info-text)', bgVar: 'var(--info-tint)' },
    neutral: { icon: Clock, colorVar: 'var(--text-secondary)', bgVar: 'var(--surface-subtle)' }
  };
  const { icon: Icon, colorVar, bgVar } = config[type] || config.neutral;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none tracking-tight"
      style={{
        color: colorVar,
        backgroundColor: bgVar,
        border: '1px solid var(--border-decorative)'
      }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/**
 * OverlayModalOrSheet:
 * Renders as a native Bottom Sheet on mobile/tablet (<1200px or inside Mobile 390px preview)
 * and a centered Modal Dialog on desktop (>=1200px).
 */
function OverlayModalOrSheet({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
  contained = false
}) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 40);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const posClass = contained ? 'absolute inset-0' : 'fixed inset-0';
  const alignClass = contained
    ? 'items-end justify-center p-0'
    : 'items-end min-[1200px]:items-center justify-center p-0 min-[1200px]:p-6';
  const radiusClass = contained
    ? 'rounded-t-[24px]'
    : 'rounded-t-[24px] min-[1200px]:rounded-[24px]';

  return (
    <div
      className={`${posClass} z-50 flex ${alignClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="overlay-title"
      aria-describedby={description ? 'overlay-desc' : undefined}
    >
      {/* Backdrop */}
      <div
        className={`${posClass} bg-black/55 backdrop-blur-[2px]`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className={`relative z-10 w-full ${contained ? '' : maxWidth} ${radiusClass} max-h-[86%] flex flex-col overflow-hidden`}
        style={{
          backgroundColor: 'var(--surface-raised)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-decorative)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.28)'
        }}
      >
        {/* Drag handle indicator for mobile/tablet */}
        <div className={`flex justify-center pt-3 pb-1 ${contained ? '' : 'min-[1200px]:hidden'}`} aria-hidden="true">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-control)' }} />
        </div>

        {/* Header */}
        <div
          className={`flex items-start justify-between gap-4 px-5 pt-2.5 pb-4 ${contained ? '' : 'min-[1200px]:pt-5'} border-b`}
          style={{ borderColor: 'var(--border-decorative)' }}
        >
          <div>
            <h2 id="overlay-title" className="text-lg font-bold leading-snug">
              {title}
            </h2>
            {description && (
              <p id="overlay-desc" className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="resora-focus inline-flex items-center justify-center w-11 h-11 rounded-[12px] shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-decorative)'
            }}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * DiagnosisBlock: Selectable diagnosis output with safe copy button and feedback
 */
function DiagnosisBlock({ text, onCopied }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      onCopied('Diagnosis disalin');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onCopied('Gagal menyalin otomatis. Kamu bisa menyorot dan menyalin teks secara manual.');
    }
  };

  return (
    <div
      className="rounded-[16px] p-4 space-y-3"
      style={{
        backgroundColor: 'var(--surface-subtle)',
        border: '1px solid var(--border-decorative)'
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Detail Diagnosis
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="resora-focus resora-btn-primary inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-[12px] text-sm font-semibold cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          <span>{copied ? 'Diagnosis disalin' : 'Salin diagnosis'}</span>
        </button>
      </div>
      <pre
        className="text-xs sm:text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words select-text p-3.5 rounded-[12px] tabular-nums overflow-x-auto"
        style={{
          backgroundColor: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-decorative)'
        }}
      >
        {text}
      </pre>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Teks di atas bisa diseleksi manual jika clipboard perangkat tidak tersedia. Koordinat presisi tidak disertakan.
      </p>
    </div>
  );
}

// ============================================================================
// INTERACTIVE SVG CHARTS (RESORA DESIGN SYSTEM 1.0 + WCAG 2.2 AA)
// ============================================================================

/**
 * Chart 1: Aktivitas Kehadiran Mingguan (Interactive Rounded Bar Chart + Hatch Pattern + Table Toggle)
 */
function WeeklyAttendanceBarChart({ compact = false }) {
  const [selectedIndex, setSelectedIndex] = useState(4); // Peak: Jumat
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'
  const activeItem = WEEKLY_ATTENDANCE_DATA[selectedIndex];
  const maxCount = 60;
  const totalWeek = WEEKLY_ATTENDANCE_DATA.reduce((acc, d) => acc + d.count, 0);

  return (
    <section
      aria-labelledby="chart-weekly-title"
      className="rounded-[20px] p-5 flex flex-col justify-between gap-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border-decorative)'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="chart-weekly-title" className="text-base font-bold leading-snug">
            Aktivitas Kehadiran Mingguan
          </h2>
          <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Total pekan ini: {totalWeek} kehadiran · 20 sampai 26 Nov 2026
          </p>
        </div>

        {/* Chart / Table Toggle */}
        <div
          className="inline-flex rounded-[12px] p-0.5 shrink-0"
          style={{
            backgroundColor: 'var(--surface-subtle)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            aria-pressed={viewMode === 'chart'}
            aria-label="Tampilan grafik mingguan"
            className="resora-focus inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-[10px] text-xs font-semibold cursor-pointer"
            style={
              viewMode === 'chart'
                ? { backgroundColor: '#FFF46E', color: '#333333' }
                : { color: 'var(--text-secondary)' }
            }
          >
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Grafik</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            aria-pressed={viewMode === 'table'}
            aria-label="Tampilan tabel mingguan"
            className="resora-focus inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-[10px] text-xs font-semibold cursor-pointer"
            style={
              viewMode === 'table'
                ? { backgroundColor: '#FFF46E', color: '#333333' }
                : { color: 'var(--text-secondary)' }
            }
          >
            <TableIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tabel</span>
          </button>
        </div>
      </div>

      {/* Selected KPI Readout */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span className="text-3xl font-bold tabular-nums leading-none">
            {activeItem.count}
          </span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            dari {activeItem.target} peserta ({activeItem.rate.toFixed(1).replace('.', ',')}%)
          </span>
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full tabular-nums"
          style={{ backgroundColor: '#FFF46E', color: '#333333' }}
        >
          {activeItem.fullDay}
        </span>
      </div>

      {viewMode === 'chart' ? (
        <div className="w-full pt-2">
          <svg
            viewBox="0 0 350 175"
            className="w-full h-auto overflow-visible"
            role="img"
            aria-label={`Grafik batang aktivitas kehadiran mingguan. Hari dipilih: ${activeItem.fullDay} dengan ${activeItem.count} peserta.`}
          >
            <defs>
              <pattern
                id="resora-bar-hatch"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="8" height="8" fill="#FF6F6F" />
                <line x1="0" y1="0" x2="0" y2="8" stroke="#333333" strokeOpacity="0.22" strokeWidth="2.5" />
              </pattern>
            </defs>

            {/* Subtle horizontal reference lines */}
            {[45, 95, 145].map((yPos) => (
              <line
                key={yPos}
                x1="6"
                y1={yPos}
                x2="344"
                y2={yPos}
                stroke="var(--border-decorative)"
                strokeDasharray="3 4"
                strokeWidth="1"
              />
            ))}

            {WEEKLY_ATTENDANCE_DATA.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const barW = compact ? 32 : 36;
              const spacing = 48;
              const x = 14 + idx * spacing;
              const maxBarH = 104;
              const barH = Math.max(18, Math.round((item.count / maxCount) * maxBarH));
              const y = 145 - barH;

              return (
                <g
                  key={item.day}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.fullDay}: ${item.count} dari ${item.target} peserta (${item.rate}%)`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedIndex(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIndex(idx);
                    }
                  }}
                  className="cursor-pointer outline-none focus-visible:outline-2"
                >
                  {/* Floating yellow pill callout above active bar */}
                  {isSelected && (
                    <g transform={`translate(${x + barW / 2}, ${y - 26})`}>
                      <rect
                        x="-24"
                        y="0"
                        width="48"
                        height="20"
                        rx="10"
                        fill="#FFF46E"
                        stroke="#333333"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="13.5"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill="#333333"
                        className="tabular-nums"
                      >
                        {item.count}
                      </text>
                    </g>
                  )}

                  {/* Rounded Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx="10"
                    fill={isSelected ? 'url(#resora-bar-hatch)' : 'var(--surface-subtle)'}
                    stroke={isSelected ? '#333333' : 'var(--border-decorative)'}
                    strokeWidth={isSelected ? '1.5' : '1'}
                  />

                  {/* Day Axis Label (WCAG AA compliant text.secondary or text.primary) */}
                  <text
                    x={x + barW / 2}
                    y="166"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={isSelected ? '700' : '600'}
                    fill={isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  >
                    {item.day}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px]" style={{ border: '1px solid var(--border-decorative)' }}>
          <table className="w-full text-left text-xs tabular-nums border-collapse">
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-decorative)'
                }}
              >
                <th className="px-3 py-2 font-semibold">Hari</th>
                <th className="px-3 py-2 font-semibold text-right">Hadir</th>
                <th className="px-3 py-2 font-semibold text-right">Target</th>
                <th className="px-3 py-2 font-semibold text-right">Persentase</th>
              </tr>
            </thead>
            <tbody>
              {WEEKLY_ATTENDANCE_DATA.map((row) => (
                <tr
                  key={row.day}
                  style={{ borderBottom: '1px solid var(--border-decorative)' }}
                  className="last:border-b-0"
                >
                  <td className="px-3 py-2 font-semibold">{row.fullDay}</td>
                  <td className="px-3 py-2 text-right">{row.count}</td>
                  <td className="px-3 py-2 text-right">{row.target}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {row.rate.toFixed(1).replace('.', ',')}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Chart 2: Perbandingan Tren Kehadiran (Dual-Period Hatched Area Comparison Chart)
 */
function AttendanceComparisonAreaChart() {
  const [activeIdx, setActiveIdx] = useState(5);
  const w = 360;
  const h = 150;
  const padX = 24;
  const padTop = 24;
  const padBottom = 26;
  const minVal = 70;
  const maxVal = 100;

  const getX = (i) => padX + (i * (w - padX * 2)) / (TREND_COMPARISON_DATA.length - 1);
  const getY = (v) => padTop + ((maxVal - v) / (maxVal - minVal)) * (h - padTop - padBottom);

  const currentPts = TREND_COMPARISON_DATA.map((d, i) => [getX(i), getY(d.current)]);
  const prevPts = TREND_COMPARISON_DATA.map((d, i) => [getX(i), getY(d.previous)]);

  const linePath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const bandPath = `${linePath(currentPts)} ${[...prevPts]
    .reverse()
    .map((p) => `L ${p[0]} ${p[1]}`)
    .join(' ')} Z`;

  const selected = TREND_COMPARISON_DATA[activeIdx];
  const delta = selected.current - selected.previous;

  return (
    <section
      aria-labelledby="chart-comparison-title"
      className="rounded-[20px] p-5 flex flex-col justify-between gap-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border-decorative)'
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="chart-comparison-title" className="text-base font-bold leading-snug">
            Perbandingan Tren Kehadiran
          </h2>
          <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Nov 2026 · 14 kegiatan (Bulan Ini vs Bulan Lalu)
          </p>
        </div>

        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums"
          style={{ backgroundColor: '#FFF46E', color: '#333333' }}
        >
          <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
          +8,4%
        </span>
      </div>

      {/* Main KPI & Legend */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-bold tabular-nums leading-none">92,4%</div>
          <div className="text-xs mt-1 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Titik {selected.label}: <strong style={{ color: 'var(--text-primary)' }}>{selected.current}%</strong> vs{' '}
            {selected.previous}% ({delta >= 0 ? `+${delta}%` : `${delta}%`})
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#FF6F6F' }} />
            Nov 2026
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#A58BFF' }} />
            Okt 2026
          </span>
        </div>
      </div>

      {/* Dual-Period Hatched Band SVG */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label="Grafik perbandingan tren kehadiran bulan ini sebesar 92,4 persen naik 8,4 persen dibanding bulan lalu."
        >
          <defs>
            <pattern
              id="resora-area-hatch"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="7" stroke="#A58BFF" strokeOpacity="0.45" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Gridlines */}
          {[75, 85, 95].map((val) => (
            <g key={val}>
              <line
                x1={padX}
                y1={getY(val)}
                x2={w - padX}
                y2={getY(val)}
                stroke="var(--border-decorative)"
                strokeDasharray="3 4"
                strokeWidth="1"
              />
              <text
                x={padX - 6}
                y={getY(val) + 4}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill="var(--text-secondary)"
                className="tabular-nums"
              >
                {val}%
              </text>
            </g>
          ))}

          {/* Hatched Difference Band */}
          <path d={bandPath} fill="url(#resora-area-hatch)" />

          {/* Previous Month Line (Dashed Purple Accent) */}
          <path
            d={linePath(prevPts)}
            fill="none"
            stroke="#A58BFF"
            strokeWidth="2.2"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />

          {/* Current Month Line (Solid Coral Primary) */}
          <path
            d={linePath(currentPts)}
            fill="none"
            stroke="#FF6F6F"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Nodes */}
          {TREND_COMPARISON_DATA.map((d, i) => {
            const cx = currentPts[i][0];
            const cy = currentPts[i][1];
            const isSelected = i === activeIdx;
            return (
              <g
                key={d.label}
                tabIndex={0}
                role="button"
                aria-label={`Sesi ${d.label}: Bulan ini ${d.current}%, Bulan lalu ${d.previous}%`}
                onClick={() => setActiveIdx(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveIdx(i);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                {isSelected && (
                  <g transform={`translate(${cx}, ${cy - 24})`}>
                    <rect x="-22" y="0" width="44" height="19" rx="9.5" fill="#FFF46E" stroke="#333333" strokeWidth="1" />
                    <text
                      x="0"
                      y="13"
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight="700"
                      fill="#333333"
                      className="tabular-nums"
                    >
                      {d.current}%
                    </text>
                  </g>
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 5.5 : 3.5}
                  fill={isSelected ? '#FF6F6F' : 'var(--surface)'}
                  stroke={isSelected ? 'var(--text-primary)' : '#FF6F6F'}
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={h - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isSelected ? '700' : '600'}
                  fill={isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/**
 * Chart 3: Tren Ketepatan Waktu (Smooth Spline Line Chart)
 */
function PunctualitySplineChart() {
  const [activeIdx, setActiveIdx] = useState(4);
  const w = 340;
  const h = 136;
  const padX = 20;
  const padTop = 24;
  const padBottom = 24;

  const pts = PUNCTUALITY_SPLINE_DATA.map((d, i) => ({
    x: padX + (i * (w - padX * 2)) / (PUNCTUALITY_SPLINE_DATA.length - 1),
    y: padTop + ((100 - d.pct) / 40) * (h - padTop - padBottom),
    ...d
  }));

  // Smooth cubic bezier path
  const smoothPath = pts.reduce((path, pt, i, arr) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${path} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  const areaPath = `${smoothPath} L ${pts[pts.length - 1].x} ${h - padBottom} L ${pts[0].x} ${h - padBottom} Z`;
  const selected = pts[activeIdx];

  return (
    <section
      aria-labelledby="chart-spline-title"
      className="rounded-[20px] p-5 flex flex-col justify-between gap-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border-decorative)'
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="chart-spline-title" className="text-base font-bold leading-snug">
            Tren Ketepatan Waktu
          </h2>
          <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Rata-rata tepat waktu pekan ini · 84,0%
          </p>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-xs font-bold tabular-nums"
          style={{ backgroundColor: '#A58BFF', color: '#333333' }}
        >
          {selected.day}: {selected.pct}%
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Compact side metrics */}
        <div className="hidden sm:flex flex-col gap-2 shrink-0 min-w-[92px]">
          <div
            className="rounded-[12px] px-3 py-2 tabular-nums"
            style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-decorative)' }}
          >
            <div className="text-base font-bold leading-none">{selected.onTime}</div>
            <div className="text-[11px] font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
              Tepat waktu
            </div>
          </div>
          <div
            className="rounded-[12px] px-3 py-2 tabular-nums"
            style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-decorative)' }}
          >
            <div className="text-base font-bold leading-none">91%</div>
            <div className="text-[11px] font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
              Rekor pekan
            </div>
          </div>
        </div>

        {/* Spline SVG */}
        <div className="flex-1 min-w-0">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-auto overflow-visible"
            role="img"
            aria-label={`Grafik kurva ketepatan waktu. Hari ${selected.day} mencatat ${selected.pct} persen tepat waktu.`}
          >
            <defs>
              <linearGradient id="resora-spline-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A58BFF" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#A58BFF" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <path d={areaPath} fill="url(#resora-spline-fill)" />
            <path
              d={smoothPath}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {pts.map((pt, i) => {
              const isSelected = i === activeIdx;
              return (
                <g
                  key={pt.day}
                  tabIndex={0}
                  role="button"
                  aria-label={`${pt.day}: ${pt.pct}% tepat waktu (${pt.onTime} peserta)`}
                  onClick={() => setActiveIdx(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveIdx(i);
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  {isSelected && (
                    <g transform={`translate(${pt.x}, ${pt.y - 24})`}>
                      <rect x="-21" y="0" width="42" height="19" rx="9.5" fill="#FFF46E" stroke="#333333" strokeWidth="1" />
                      <text
                        x="0"
                        y="13"
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="700"
                        fill="#333333"
                        className="tabular-nums"
                      >
                        {pt.pct}%
                      </text>
                    </g>
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5.5 : 3.5}
                    fill={isSelected ? '#A58BFF' : 'var(--text-primary)'}
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                  <text
                    x={pt.x}
                    y={h - 5}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={isSelected ? '700' : '600'}
                    fill={isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  >
                    {pt.day}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}

/**
 * Chart 4: Distribusi Status Kehadiran (Horizontal Proportional Bars)
 */
function StatusDistributionCard() {
  const totalCount = STATUS_DISTRIBUTION.reduce((acc, s) => acc + s.count, 0);

  return (
    <section
      aria-labelledby="chart-dist-title"
      className="rounded-[20px] p-5 flex flex-col justify-between gap-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border-decorative)'
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="chart-dist-title" className="text-base font-bold leading-snug">
            Distribusi Status Kehadiran
          </h2>
          <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Total {totalCount} catatan · Periode Nov 2026
          </p>
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full tabular-nums"
          style={{
            backgroundColor: 'var(--surface-subtle)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          100%
        </span>
      </div>

      <div className="space-y-4">
        {STATUS_DISTRIBUTION.map((item) => (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge type={item.type}>{item.label}</StatusBadge>
              </div>
              <span className="font-bold tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
                {item.pct}% <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>({item.count})</span>
              </span>
            </div>
            <div
              className="h-3.5 w-full rounded-full overflow-hidden"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                border: '1px solid var(--border-decorative)'
              }}
              role="progressbar"
              aria-valuenow={item.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${item.label}: ${item.pct}% (${item.count} catatan)`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${item.pct}%`,
                  backgroundColor: item.fill,
                  borderRight: '1px solid rgba(51,51,51,0.25)'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  // 1. Theme State (Light default, persisted in localStorage)
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('resora_theme_v1');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('resora_theme_v1', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // 2. Preview Viewport Mode ('auto' | 'mobile')
  const [viewMode, setViewMode] = useState('auto');
  const isMobilePreview = viewMode === 'mobile';

  // 3. Role State (Anggota, Pengurus, SYSTEM_ADMIN)
  const [role, setRole] = useState('PENGURUS');
  const canScanQR = role !== 'SYSTEM_ADMIN';
  const isPengurusOrAdmin = role === 'PENGURUS' || role === 'SYSTEM_ADMIN';

  // 4. Desktop Sidebar Collapse State (persisted)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('resora_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('resora_sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  // 5. Navigation & Overlay States
  const [activePage, setActivePage] = useState('beranda');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);

  // Preserved Inbox State
  const [inboxQuery, setInboxQuery] = useState('');
  const [inboxCategory, setInboxCategory] = useState('Semua');
  const [inboxVisibleCount, setInboxVisibleCount] = useState(3);
  const [inboxFilterOpen, setInboxFilterOpen] = useState(false);

  // Global Quick Search on Beranda Mobile
  const [dashboardSearch, setDashboardSearch] = useState('');

  // Diagnosis Modal State
  const [diagnosisModal, setDiagnosisModal] = useState({ open: false, title: '', text: '' });

  // Toast State
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = (message, actionLabel = null, onAction = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, actionLabel, onAction });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, actionLabel ? 5000 : 3500);
  };

  // Unsaved Draft Guard
  const [formHasUnsavedDraft, setFormHasUnsavedDraft] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState(null);

  const navigateTo = (targetPage, options = {}) => {
    if (activePage === 'create-event' && formHasUnsavedDraft && targetPage !== 'create-event' && !options.bypassGuard) {
      setPendingNavTarget(targetPage);
      return;
    }
    setSelectedEvent(null);
    setSelectedAnnouncement(null);
    setAppsLauncherOpen(false);
    setActivePage(targetPage);
  };

  const pageTitleMap = {
    beranda: 'Beranda',
    inbox: 'Inbox',
    profil: 'Profil',
    scan: 'Scan QR',
    'create-event': 'Buat Kegiatan',
    events: 'Jadwal & Kegiatan',
    committees: 'Kepanitiaan',
    points: 'Rekap Poin',
    users: 'Kelola Akun',
    periods: 'Periode'
  };

  // Helper to render the core app content (used both in Auto mode and inside 390px Phone Frame)
  const renderAppSurface = (contained) => {
    const showDesktopSidebar = !contained;

    return (
      <div
        className={`relative flex flex-col ${contained ? 'h-full overflow-hidden' : 'min-h-[100dvh]'}`}
        style={{ backgroundColor: 'var(--canvas)', color: 'var(--text-primary)' }}
      >
        {activePage === 'scan' ? (
          <ScanQRFullScreen
            contained={contained}
            onBack={() => navigateTo('beranda')}
            onShowToast={showToast}
            onOpenDiagnosis={(title, text) => setDiagnosisModal({ open: true, title, text })}
          />
        ) : (
          <div className={`flex flex-1 min-h-0 ${contained ? 'overflow-hidden' : ''}`}>
            {/* DESKTOP COLLAPSIBLE SIDEBAR (>=1200px, hidden in 390px Mobile Preview) */}
            {showDesktopSidebar && (
              <aside
                aria-label="Navigasi utama desktop"
                className={`hidden min-[1200px]:flex flex-col shrink-0 sticky top-0 h-[100dvh] border-r transition-[width] duration-200 ${
                  sidebarCollapsed ? 'w-[76px]' : 'w-[248px]'
                }`}
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border-decorative)'
                }}
              >
                {/* Brand Header */}
                <div
                  className="flex items-center justify-between h-16 px-4 border-b"
                  style={{ borderColor: 'var(--border-decorative)' }}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div
                      className="w-9 h-9 rounded-[12px] flex items-center justify-center font-bold text-base shrink-0"
                      style={{ backgroundColor: '#FF6F6F', color: '#333333' }}
                      aria-hidden="true"
                    >
                      R
                    </div>
                    {!sidebarCollapsed && (
                      <div className="truncate">
                        <div className="font-bold text-base tracking-tight leading-tight">RESORA</div>
                        <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          Sistem Asrama
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed((c) => !c)}
                    aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
                    title={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
                    className="resora-focus inline-flex items-center justify-center w-9 h-9 rounded-[10px] cursor-pointer shrink-0"
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-decorative)'
                    }}
                  >
                    {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </button>
                </div>

                {/* Primary Scan QR CTA (Hidden for SYSTEM_ADMIN) */}
                {canScanQR && (
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => navigateTo('scan')}
                      title="Scan QR Absen"
                      aria-label="Scan QR Absen"
                      className={`resora-focus resora-btn-primary w-full h-12 rounded-[12px] font-semibold text-sm flex items-center justify-center gap-2.5 cursor-pointer ${
                        sidebarCollapsed ? 'px-0' : 'px-4'
                      }`}
                    >
                      <QrCode className="w-5 h-5 shrink-0" aria-hidden="true" />
                      {!sidebarCollapsed && <span>Scan QR Absen</span>}
                    </button>
                  </div>
                )}

                {/* Sidebar Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
                  <div>
                    {!sidebarCollapsed && (
                      <div
                        className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Utama
                      </div>
                    )}
                    <ul className="space-y-1">
                      {[
                        { id: 'beranda', label: 'Beranda', icon: Home },
                        { id: 'inbox', label: 'Inbox', icon: Inbox },
                        { id: 'profil', label: 'Profil', icon: UserCheck }
                      ].map((item) => {
                        const Icon = item.icon;
                        const active = activePage === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => navigateTo(item.id)}
                              aria-current={active ? 'page' : undefined}
                              title={sidebarCollapsed ? item.label : undefined}
                              className={`resora-focus w-full min-h-[44px] rounded-[12px] flex items-center gap-3 cursor-pointer ${
                                sidebarCollapsed ? 'justify-center px-0' : 'px-3'
                              }`}
                              style={
                                active
                                  ? { backgroundColor: '#FF6F6F', color: '#333333', fontWeight: 700 }
                                  : { color: 'var(--text-primary)', fontWeight: 500 }
                              }
                            >
                              <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                              {!sidebarCollapsed && <span className="text-sm truncate">{item.label}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div>
                    {!sidebarCollapsed && (
                      <div
                        className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Modul
                      </div>
                    )}
                    <ul className="space-y-1">
                      {[
                        { id: 'events', label: 'Jadwal & Kegiatan', icon: Calendar },
                        { id: 'committees', label: 'Kepanitiaan', icon: Users },
                        { id: 'points', label: 'Rekap Poin', icon: Award },
                        { id: 'create-event', label: 'Buat Kegiatan', icon: Plus }
                      ].map((item) => {
                        const Icon = item.icon;
                        const active = activePage === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => navigateTo(item.id)}
                              aria-current={active ? 'page' : undefined}
                              title={sidebarCollapsed ? item.label : undefined}
                              className={`resora-focus w-full min-h-[44px] rounded-[12px] flex items-center gap-3 cursor-pointer ${
                                sidebarCollapsed ? 'justify-center px-0' : 'px-3'
                              }`}
                              style={
                                active
                                  ? { backgroundColor: '#FF6F6F', color: '#333333', fontWeight: 700 }
                                  : { color: 'var(--text-primary)', fontWeight: 500 }
                              }
                            >
                              <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                              {!sidebarCollapsed && <span className="text-sm truncate">{item.label}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {isPengurusOrAdmin && (
                    <div>
                      {!sidebarCollapsed && (
                        <div
                          className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Administrasi
                        </div>
                      )}
                      <ul className="space-y-1">
                        {[
                          { id: 'users', label: 'Kelola Akun', icon: Shield },
                          { id: 'periods', label: 'Periode', icon: CalendarRange }
                        ].map((item) => {
                          const Icon = item.icon;
                          const active = activePage === item.id;
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => navigateTo(item.id)}
                                aria-current={active ? 'page' : undefined}
                                title={sidebarCollapsed ? item.label : undefined}
                                className={`resora-focus w-full min-h-[44px] rounded-[12px] flex items-center gap-3 cursor-pointer ${
                                  sidebarCollapsed ? 'justify-center px-0' : 'px-3'
                                }`}
                                style={
                                  active
                                    ? { backgroundColor: '#FF6F6F', color: '#333333', fontWeight: 700 }
                                    : { color: 'var(--text-primary)', fontWeight: 500 }
                                }
                              >
                                <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                                {!sidebarCollapsed && <span className="text-sm truncate">{item.label}</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </nav>

                {/* Sidebar User Card */}
                <div className="p-3 border-t" style={{ borderColor: 'var(--border-decorative)' }}>
                  <button
                    type="button"
                    onClick={() => navigateTo('profil')}
                    title="Buka Profil"
                    className={`resora-focus w-full min-h-[44px] rounded-[12px] p-2 flex items-center gap-2.5 cursor-pointer ${
                      sidebarCollapsed ? 'justify-center' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      border: '1px solid var(--border-decorative)'
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: '#A58BFF', color: '#333333' }}
                    >
                      NF
                    </div>
                    {!sidebarCollapsed && (
                      <div className="text-left min-w-0">
                        <div className="text-xs font-bold truncate">Nabil Fikry</div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {ROLES.find((r) => r.id === role)?.label}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              </aside>
            )}

            {/* MAIN CONTENT COLUMN */}
            <div className={`flex-1 flex flex-col min-w-0 ${contained ? 'overflow-y-auto' : ''}`}>
              {/* ============================================================
                  TOP HEADER:
                  - Desktop (>=1200px, auto): Breadcrumb + Period + Preview Toggle + Role + Theme
                  - Mobile (<1200px or 390px preview): Clean Native App Header (Bold 24px Title + Quick Actions + Avatar)
                 ============================================================ */}
              {!contained && (
                <header
                  className="hidden min-[1200px]:flex sticky top-0 z-10 h-16 px-8 border-b items-center justify-between gap-4"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border-decorative)'
                  }}
                >
                  {/* Breadcrumb */}
                  <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
                    <span style={{ color: 'var(--text-secondary)' }}>RESORA</span>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                    <span className="font-bold truncate">{pageTitleMap[activePage] || 'Beranda'}</span>
                    {selectedEvent && (
                      <>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                        <span className="truncate max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>
                          {selectedEvent.title}
                        </span>
                      </>
                    )}
                  </nav>

                  {/* Right Controls */}
                  <div className="flex items-center gap-2.5">
                    {/* Period Pill */}
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-decorative)'
                      }}
                    >
                      <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
                      Periode 2026/2027
                    </span>

                    {/* Viewport Preview Toggle: Otomatis | Mobile 390px */}
                    <div
                      className="inline-flex items-center rounded-full p-1"
                      role="group"
                      aria-label="Mode tampilan pratinjau"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        border: '1px solid var(--border-decorative)'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setViewMode('auto')}
                        aria-pressed={viewMode === 'auto'}
                        className="resora-focus inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                        style={
                          viewMode === 'auto'
                            ? { backgroundColor: '#A58BFF', color: '#333333' }
                            : { color: 'var(--text-secondary)' }
                        }
                      >
                        <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Otomatis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('mobile')}
                        aria-pressed={viewMode === 'mobile'}
                        className="resora-focus inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                        style={
                          viewMode === 'mobile'
                            ? { backgroundColor: '#A58BFF', color: '#333333' }
                            : { color: 'var(--text-secondary)' }
                        }
                      >
                        <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Mobile 390px</span>
                      </button>
                    </div>

                    {/* Role Switcher */}
                    <div
                      className="inline-flex items-center rounded-full p-1"
                      role="group"
                      aria-label="Pilih peran demo"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        border: '1px solid var(--border-decorative)'
                      }}
                    >
                      {ROLES.map((r) => {
                        const isSelected = role === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setRole(r.id);
                              showToast(`Mode peran diubah ke ${r.label}.`);
                            }}
                            aria-pressed={isSelected}
                            className="resora-focus min-h-[34px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                            style={
                              isSelected
                                ? { backgroundColor: '#FFF46E', color: '#333333' }
                                : { color: 'var(--text-secondary)' }
                            }
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Theme Toggle */}
                    <button
                      type="button"
                      onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                      aria-label={theme === 'light' ? 'Aktifkan mode gelap' : 'Aktifkan mode terang'}
                      className="resora-focus inline-flex items-center justify-center w-11 h-11 rounded-[12px] cursor-pointer"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-decorative)'
                      }}
                    >
                      {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    </button>
                  </div>
                </header>
              )}

              {/* NATIVE MOBILE APP HEADER (<1200px or inside 390px preview) */}
              <header
                className={`${contained ? 'flex' : 'flex min-[1200px]:hidden'} sticky top-0 z-10 px-4 pt-3 pb-2.5 items-center justify-between gap-3`}
                style={{
                  backgroundColor: 'var(--canvas)'
                }}
              >
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight leading-tight truncate">
                    {pageTitleMap[activePage] || 'Beranda'}
                  </h1>
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                    {ROLES.find((r) => r.id === role)?.desc}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Theme Toggle */}
                  <button
                    type="button"
                    onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                    aria-label={theme === 'light' ? 'Aktifkan mode gelap' : 'Aktifkan mode terang'}
                    className="resora-focus inline-flex items-center justify-center w-11 h-11 rounded-full cursor-pointer"
                    style={{
                      backgroundColor: 'var(--surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-decorative)'
                    }}
                  >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                  </button>

                  {/* Avatar */}
                  <button
                    type="button"
                    onClick={() => navigateTo('profil')}
                    aria-label="Buka profil"
                    className="resora-focus w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer relative"
                    style={{ backgroundColor: '#A58BFF', color: '#333333' }}
                  >
                    NF
                  </button>
                </div>
              </header>

              {/* Mobile Role Switcher Pill Strip (only on mobile viewport when not inside desktop preview bar) */}
              {!contained && (
                <div className="flex min-[1200px]:hidden items-center justify-between gap-2 px-4 pb-2">
                  <div
                    className="inline-flex items-center rounded-full p-1 w-full"
                    role="group"
                    aria-label="Pilih peran demo mobile"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border-decorative)'
                    }}
                  >
                    {ROLES.map((r) => {
                      const isSelected = role === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setRole(r.id);
                            showToast(`Mode peran diubah ke ${r.label}.`);
                          }}
                          aria-pressed={isSelected}
                          className="resora-focus flex-1 min-h-[36px] rounded-full text-xs font-semibold cursor-pointer"
                          style={
                            isSelected
                              ? { backgroundColor: '#FFF46E', color: '#333333' }
                              : { color: 'var(--text-secondary)' }
                          }
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MAIN CONTENT AREA */}
              <main
                id="main-content"
                className={`flex-1 w-full mx-auto ${
                  contained
                    ? 'px-4 pt-2 pb-28'
                    : 'max-w-[1440px] px-4 md:px-6 min-[1200px]:px-8 py-4 min-[1200px]:py-6 pb-32 min-[1200px]:pb-10'
                }`}
              >
                {activePage === 'beranda' && (
                  <BerandaPage
                    role={role}
                    canScanQR={canScanQR}
                    isPengurusOrAdmin={isPengurusOrAdmin}
                    compact={contained}
                    dashboardSearch={dashboardSearch}
                    onDashboardSearchChange={setDashboardSearch}
                    selectedEvent={selectedEvent}
                    onSelectEvent={setSelectedEvent}
                    onNavigate={navigateTo}
                  />
                )}

                {activePage === 'inbox' && (
                  <InboxPage
                    contained={contained}
                    query={inboxQuery}
                    onQueryChange={setInboxQuery}
                    category={inboxCategory}
                    onCategoryChange={setInboxCategory}
                    visibleCount={inboxVisibleCount}
                    onLoadMore={() => setInboxVisibleCount((c) => Math.min(c + 3, ANNOUNCEMENTS.length))}
                    filterOpen={inboxFilterOpen}
                    onSetFilterOpen={setInboxFilterOpen}
                    selectedAnnouncement={selectedAnnouncement}
                    onSelectAnnouncement={setSelectedAnnouncement}
                  />
                )}

                {activePage === 'profil' && (
                  <ProfilPage
                    role={role}
                    compact={contained}
                    onOpenDiagnosis={(title, text) => setDiagnosisModal({ open: true, title, text })}
                  />
                )}

                {activePage === 'create-event' && (
                  <CreateEventFormPage
                    contained={contained}
                    onBack={() => navigateTo('beranda')}
                    onShowToast={showToast}
                    onDraftStateChange={setFormHasUnsavedDraft}
                  />
                )}

                {activePage === 'events' && (
                  <EventsModulePage
                    selectedEvent={selectedEvent}
                    onSelectEvent={setSelectedEvent}
                    onCreateEvent={() => navigateTo('create-event')}
                    onScan={() => navigateTo('scan')}
                    canScanQR={canScanQR}
                    isPengurusOrAdmin={isPengurusOrAdmin}
                  />
                )}

                {(activePage === 'committees' ||
                  activePage === 'points' ||
                  activePage === 'users' ||
                  activePage === 'periods') && (
                  <SecondaryModulePage
                    pageId={activePage}
                    isPengurusOrAdmin={isPengurusOrAdmin}
                    onNavigate={navigateTo}
                  />
                )}
              </main>
            </div>
          </div>
        )}

        {/* ================================================================
            FLOATING PILL BOTTOM NAVBAR + SEPARATE SCAN QR BUTTON
            Shown on <1200px or inside Mobile 390px preview, hidden on Scan QR
           ================================================================ */}
        {activePage !== 'scan' && (
          <div
            className={`${contained ? 'absolute' : 'fixed min-[1200px]:hidden'} bottom-0 inset-x-0 z-20 pointer-events-none px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom))]`}
          >
            <div className="max-w-[380px] mx-auto flex items-center justify-center gap-2.5 pointer-events-auto">
              {/* Floating Pill (4 Approved Destinations: Beranda, Inbox, Profil, Apps) */}
              <nav
                aria-label="Navigasi utama mobile"
                className="flex-1 flex items-center justify-between p-1.5 rounded-full"
                style={{
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border-decorative)',
                  boxShadow: 'var(--nav-shadow)'
                }}
              >
                {[
                  { id: 'beranda', label: 'Beranda', icon: Home, isLauncher: false },
                  { id: 'inbox', label: 'Inbox', icon: Inbox, isLauncher: false },
                  { id: 'profil', label: 'Profil', icon: UserCheck, isLauncher: false },
                  { id: 'apps', label: 'Apps', icon: LayoutGrid, isLauncher: true }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = tab.isLauncher
                    ? appsLauncherOpen ||
                      ['events', 'committees', 'points', 'create-event', 'users', 'periods'].includes(activePage)
                    : activePage === tab.id && !appsLauncherOpen;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        if (tab.isLauncher) {
                          setAppsLauncherOpen(true);
                        } else {
                          navigateTo(tab.id);
                        }
                      }}
                      aria-current={!tab.isLauncher && isActive ? 'page' : undefined}
                      aria-expanded={tab.isLauncher ? appsLauncherOpen : undefined}
                      className="resora-focus flex-1 min-h-[48px] px-1.5 py-1 rounded-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors"
                      style={
                        isActive
                          ? { backgroundColor: '#FF6F6F', color: '#333333' }
                          : { color: 'var(--text-secondary)' }
                      }
                    >
                      <Icon
                        className="w-5 h-5 shrink-0"
                        strokeWidth={isActive ? 2.5 : 2}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] font-bold leading-tight truncate max-w-full">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </nav>

              {/* Separate Circular Scan QR Button (56x56px, #FF6F6F, #333333 icon, hidden for Admin) */}
              {canScanQR && (
                <button
                  type="button"
                  onClick={() => navigateTo('scan')}
                  aria-label="Scan QR"
                  className="resora-focus resora-btn-primary w-14 h-14 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95"
                  style={{
                    boxShadow: 'var(--nav-shadow)',
                    border: '1px solid rgba(51,51,51,0.12)'
                  }}
                >
                  <QrCode className="w-6 h-6" strokeWidth={2.3} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* APPS LAUNCHER BOTTOM SHEET */}
        <OverlayModalOrSheet
          open={appsLauncherOpen}
          onClose={() => setAppsLauncherOpen(false)}
          title="Apps & Modul"
          description="Pilih modul operasional sesuai hak akses kamu."
          contained={contained}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'events', label: 'Jadwal & Kegiatan', icon: Calendar, bg: '#FFF46E' },
                { id: 'committees', label: 'Kepanitiaan', icon: Users, bg: '#A58BFF' },
                { id: 'points', label: 'Rekap Poin', icon: Award, bg: '#FF6F6F' },
                { id: 'create-event', label: 'Buat Kegiatan', icon: Plus, bg: '#FFF46E' },
                ...(isPengurusOrAdmin
                  ? [
                      { id: 'users', label: 'Kelola Akun', icon: Shield, bg: '#A58BFF' },
                      { id: 'periods', label: 'Periode', icon: CalendarRange, bg: '#FF6F6F' }
                    ]
                  : [])
              ].map((mod) => {
                const Icon = mod.icon;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => navigateTo(mod.id)}
                    className="resora-focus flex flex-col items-center gap-2 p-3 rounded-[16px] text-center cursor-pointer"
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      border: '1px solid var(--border-decorative)'
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: mod.bg, color: '#333333' }}
                    >
                      <Icon className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-semibold leading-snug">{mod.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Disabled Upcoming Modules (Not clickable fake active features) */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Segera Hadir (Belum Aktif)
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Kebersihan Kamar', icon: ClipboardCheck },
                  { label: 'Pelanggaran', icon: FileWarning }
                ].map((upcoming) => {
                  const Icon = upcoming.icon;
                  return (
                    <div
                      key={upcoming.label}
                      aria-disabled="true"
                      className="flex items-center gap-2.5 p-3 rounded-[14px]"
                      style={{
                        backgroundColor: 'var(--surface-subtle)',
                        border: '1px dashed var(--border-control)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{upcoming.label}</div>
                        <div className="text-[11px]">Segera hadir</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </OverlayModalOrSheet>

        {/* DIAGNOSIS SHEET / MODAL */}
        <OverlayModalOrSheet
          open={diagnosisModal.open}
          onClose={() => setDiagnosisModal({ open: false, title: '', text: '' })}
          title={diagnosisModal.title || 'Diagnosis Lokasi'}
          description="Detail teknis pemulihan dan verifikasi absensi di perangkat ini."
          contained={contained}
        >
          <DiagnosisBlock text={diagnosisModal.text} onCopied={(msg) => showToast(msg)} />
        </OverlayModalOrSheet>

        {/* UNSAVED DRAFT NAVIGATION CONFIRMATION */}
        <OverlayModalOrSheet
          open={Boolean(pendingNavTarget)}
          onClose={() => setPendingNavTarget(null)}
          title="Tinggalkan halaman formulir?"
          description="Isian kamu sudah tersimpan otomatis sebagai draf di perangkat ini dan belum dikirim ke server."
          maxWidth="max-w-md"
          contained={contained}
        >
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPendingNavTarget(null)}
              className="resora-focus flex-1 h-12 rounded-[12px] font-semibold text-sm cursor-pointer"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-control)'
              }}
            >
              Lanjut mengisi
            </button>
            <button
              type="button"
              onClick={() => {
                const target = pendingNavTarget;
                setPendingNavTarget(null);
                navigateTo(target, { bypassGuard: true });
              }}
              className="resora-focus resora-btn-primary flex-1 h-12 rounded-[12px] font-semibold text-sm cursor-pointer"
            >
              Tinggalkan halaman
            </button>
          </div>
        </OverlayModalOrSheet>

        {/* NON-INTRUSIVE TOAST / SNACKBAR */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`${contained ? 'absolute bottom-24' : 'fixed bottom-24 min-[1200px]:bottom-6'} left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md`}
          >
            <div
              className="rounded-[16px] px-4 py-3 flex items-center justify-between gap-3"
              style={{
                backgroundColor: theme === 'light' ? '#333333' : '#F6F6F6',
                color: theme === 'light' ? '#FFFFFF' : '#181818',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.24)'
              }}
            >
              <span className="text-sm font-medium leading-snug">{toast.message}</span>
              <div className="flex items-center gap-2 shrink-0">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.onAction();
                      setToast(null);
                    }}
                    className="resora-focus px-2.5 py-1.5 rounded-[8px] text-xs font-bold cursor-pointer"
                    style={{ backgroundColor: '#FFF46E', color: '#333333' }}
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Tutup notifikasi"
                  className="resora-focus p-1.5 rounded-[8px] cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-theme={theme}
      className="resora-root min-h-[100dvh] font-sans antialiased selection:bg-[#FFF46E] selection:text-[#333333]"
      style={{
        backgroundColor: isMobilePreview ? (theme === 'light' ? '#E8E8E8' : '#101010') : 'var(--canvas)',
        color: 'var(--text-primary)'
      }}
    >
      {/* RESORA Design System 1.0 Strict WCAG 2.2 AA Tokens */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .resora-root {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          --canvas: #F6F6F6;
          --surface: #FFFFFF;
          --surface-raised: #FFFFFF;
          --surface-subtle: #F6F6F6;
          --text-primary: #333333;
          --text-secondary: #626262;
          --border-decorative: #E2E2E2;
          --border-control: #808080;
          --link-focus: #8C3434;
          --success-text: #166534;
          --success-tint: #DCFCE7;
          --warning-text: #854D0E;
          --warning-tint: #FEF9C3;
          --danger-text: #B91C1C;
          --danger-tint: #FEE2E2;
          --info-text: #1E40AF;
          --info-tint: #DBEAFE;
          --nav-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        }

        .resora-root[data-theme="dark"] {
          --canvas: #181818;
          --surface: #222222;
          --surface-raised: #2C2C2C;
          --surface-subtle: #303030;
          --text-primary: #F6F6F6;
          --text-secondary: #BDBDBD;
          --border-decorative: #424242;
          --border-control: #969696;
          --link-focus: #FF9A9A;
          --success-text: #86EFAC;
          --success-tint: #14291E;
          --warning-text: #FDE047;
          --warning-tint: #2E2410;
          --danger-text: #FCA5A5;
          --danger-tint: #331717;
          --info-text: #93C5FD;
          --info-tint: #15243D;
          --nav-shadow: 0 14px 36px rgba(0, 0, 0, 0.55), 0 2px 10px rgba(0, 0, 0, 0.4);
        }

        .resora-focus:focus-visible {
          outline: 2px solid var(--link-focus);
          outline-offset: 2px;
        }

        .resora-btn-primary {
          background-color: #FF6F6F;
          color: #333333;
        }
        .resora-btn-primary:hover:not(:disabled) {
          background-color: #FF8585;
        }
        .resora-btn-primary:active:not(:disabled) {
          background-color: #FF7474;
        }

        .tabular-nums {
          font-variant-numeric: tabular-nums;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2.5 focus:rounded-[12px] focus:font-bold"
        style={{ backgroundColor: '#FF6F6F', color: '#333333' }}
      >
        Lewati ke konten utama
      </a>

      {isMobilePreview ? (
        <div className="min-h-[100dvh] flex flex-col items-center justify-start py-5 px-4 gap-4">
          {/* Desktop Top Control Bar for Mobile 390px Preview */}
          <div
            className="w-full max-w-4xl rounded-[20px] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border-decorative)'
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center font-bold text-sm"
                style={{ backgroundColor: '#FF6F6F', color: '#333333' }}
              >
                R
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">Pratinjau Mobile Native (390px)</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  RESORA Design System 1.0 · WCAG 2.2 AA
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle back to Auto */}
              <div
                className="inline-flex items-center rounded-full p-1"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  border: '1px solid var(--border-decorative)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('auto')}
                  className="resora-focus inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Otomatis</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('mobile')}
                  aria-pressed="true"
                  className="resora-focus inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                  style={{ backgroundColor: '#A58BFF', color: '#333333' }}
                >
                  <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Mobile 390px</span>
                </button>
              </div>

              {/* Role Switcher */}
              <div
                className="inline-flex items-center rounded-full p-1"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  border: '1px solid var(--border-decorative)'
                }}
              >
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRole(r.id);
                      showToast(`Mode peran diubah ke ${r.label}.`);
                    }}
                    aria-pressed={role === r.id}
                    className="resora-focus min-h-[34px] px-3 rounded-full text-xs font-semibold cursor-pointer"
                    style={
                      role === r.id
                        ? { backgroundColor: '#FFF46E', color: '#333333' }
                        : { color: 'var(--text-secondary)' }
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 390px Mobile Device Frame */}
          <div
            className="w-[390px] max-w-full h-[812px] max-h-[85dvh] rounded-[42px] p-2.5 flex flex-col shrink-0"
            style={{
              backgroundColor: theme === 'light' ? '#262626' : '#0A0A0A',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)'
            }}
          >
            {/* Phone Screen */}
            <div className="flex-1 rounded-[34px] overflow-hidden relative flex flex-col">
              {/* Simulated Native Status Bar */}
              <div
                className="h-9 px-6 flex items-center justify-between text-[11px] font-bold tabular-nums shrink-0"
                style={{
                  backgroundColor: activePage === 'scan' ? '#141414' : 'var(--canvas)',
                  color: activePage === 'scan' ? '#F6F6F6' : 'var(--text-primary)'
                }}
                aria-hidden="true"
              >
                <span>12:35</span>
                <div className="w-20 h-4 rounded-full bg-black/80" />
                <span>5G · 92%</span>
              </div>

              {/* App Viewport inside Phone */}
              <div className="flex-1 min-h-0 relative">
                {renderAppSurface(true)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        renderAppSurface(false)
      )}
    </div>
  );
}

// ============================================================================
// PAGE 1: BERANDA (BENTO-GRID DASHBOARD WITH RICH SVG CHARTS)
// ============================================================================

function BerandaPage({
  role,
  canScanQR,
  isPengurusOrAdmin,
  compact,
  dashboardSearch,
  onDashboardSearchChange,
  selectedEvent,
  onSelectEvent,
  onNavigate
}) {
  if (selectedEvent) {
    return (
      <EventDetailView
        event={selectedEvent}
        canScanQR={canScanQR}
        onBack={() => onSelectEvent(null)}
        onScan={() => onNavigate('scan')}
      />
    );
  }

  const filteredEvents = useMemo(() => {
    const q = dashboardSearch.trim().toLowerCase();
    if (!q) return UPCOMING_EVENTS.slice(0, 3);
    return UPCOMING_EVENTS.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
    );
  }, [dashboardSearch]);

  const roleMeta = ROLES.find((r) => r.id === role);

  return (
    <div className="space-y-5">
      {/* Desktop Hero Header (Hidden in compact 390px or mobile where native header is active) */}
      {!compact && (
        <div className="hidden min-[1200px]:flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Kamis, 26 Nov 2026 · {roleMeta?.desc}
            </p>
            <h1 className="text-[28px] font-bold tracking-tight mt-0.5">
              Ringkasan Operasional, Nafi
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            {isPengurusOrAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('create-event')}
                className="resora-focus inline-flex items-center gap-2 h-11 px-4 rounded-[12px] text-sm font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-control)'
                }}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Buat kegiatan</span>
              </button>
            )}
            {canScanQR && (
              <button
                type="button"
                onClick={() => onNavigate('scan')}
                className="resora-focus resora-btn-primary inline-flex items-center gap-2 h-11 px-5 rounded-[12px] text-sm font-semibold cursor-pointer"
              >
                <QrCode className="w-4 h-4" aria-hidden="true" />
                <span>Scan QR Absen</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Native Mobile Search Bar Pill (Shown on mobile/tablet & 390px preview) */}
      <div className={compact ? 'block' : 'block min-[1200px]:hidden'}>
        <div className="relative">
          <Search
            className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          />
          <label htmlFor="beranda-search" className="sr-only">
            Cari jadwal atau kegiatan
          </label>
          <input
            id="beranda-search"
            type="search"
            value={dashboardSearch}
            onChange={(e) => onDashboardSearchChange(e.target.value)}
            placeholder="Cari jadwal atau kegiatan..."
            className="resora-focus w-full h-11 pl-11 pr-9 rounded-full text-sm font-medium"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-decorative)'
            }}
          />
          {dashboardSearch && (
            <button
              type="button"
              onClick={() => onDashboardSearchChange('')}
              aria-label="Hapus pencarian"
              className="resora-focus absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Native Bento Summary Cards (4-col on Desktop) */}
      <section aria-label="Ringkasan cepat">
        <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 min-[1200px]:grid-cols-4 min-[1200px]:gap-4'}`}>
          {[
            {
              label: 'Jadwal Hari Ini',
              value: '1',
              sub: '26 Nov 2026',
              icon: Calendar,
              bg: '#FF6F6F',
              action: () => onNavigate('events')
            },
            {
              label: 'Kehadiran',
              value: '92%',
              sub: 'Nov 2026',
              icon: CheckCircle2,
              bg: '#FFF46E',
              action: () => onNavigate('profil')
            },
            {
              label: 'Pengumuman',
              value: '6',
              sub: 'Periode aktif',
              icon: Megaphone,
              bg: '#A58BFF',
              action: () => onNavigate('inbox')
            },
            {
              label: 'Poin Kegiatan',
              value: '48',
              sub: 'Triwulan I',
              icon: Award,
              bg: '#FFF46E',
              action: () => onNavigate('points')
            }
          ].map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                type="button"
                onClick={card.action}
                className="resora-focus text-left rounded-[16px] p-4 flex flex-col justify-between gap-3 cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border-decorative)'
                }}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ backgroundColor: card.bg, color: '#333333' }}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-2xl font-bold tabular-nums leading-none">
                    {card.value}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-bold leading-snug">{card.label}</div>
                  <div className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {card.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Admin Notice when Scan QR is hidden */}
      {!canScanQR && (
        <div
          className="rounded-[16px] p-4 flex items-start gap-3"
          style={{
            backgroundColor: 'var(--info-tint)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--info-text)' }} aria-hidden="true" />
          <div className="text-xs sm:text-sm leading-relaxed">
            <strong style={{ color: 'var(--info-text)' }}>Mode System Admin aktif.</strong>{' '}
            Tombol Scan QR disembunyikan sesuai kebijakan karena System Admin bukan peserta absensi Senior Resident.
          </div>
        </div>
      )}

      {/* BENTO-GRID ANALYTICS CHARTS */}
      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
        <div className={compact ? '' : 'lg:col-span-5'}>
          <WeeklyAttendanceBarChart compact={compact} />
        </div>
        <div className={compact ? '' : 'lg:col-span-7'}>
          <AttendanceComparisonAreaChart />
        </div>
        <div className={compact ? '' : 'lg:col-span-7'}>
          <PunctualitySplineChart />
        </div>
        <div className={compact ? '' : 'lg:col-span-5'}>
          <StatusDistributionCard />
        </div>
      </div>

      {/* JADWAL TERDEKAT & AKSI CEPAT */}
      <section aria-labelledby="heading-jadwal-beranda" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="heading-jadwal-beranda" className="text-lg font-bold">
            Jadwal Terdekat
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('events')}
            className="resora-focus text-sm font-bold px-2 py-1 rounded-[8px] cursor-pointer"
            style={{ color: 'var(--link-focus)' }}
          >
            Lihat semua
          </button>
        </div>

        {filteredEvents.length === 0 ? (
          <div
            className="rounded-[16px] p-6 text-center text-sm"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border-decorative)',
              color: 'var(--text-secondary)'
            }}
          >
            Tidak ada jadwal yang cocok dengan kata kunci kamu.
          </div>
        ) : (
          <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 min-[1200px]:grid-cols-3'}`}>
            {filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="rounded-[16px] p-4 flex flex-col justify-between gap-3"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border-decorative)'
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelectEvent(evt)}
                  className="resora-focus text-left space-y-2 rounded-[8px] cursor-pointer"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge type={evt.statusType}>{evt.status}</StatusBadge>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {evt.category}
                    </span>
                  </div>
                  <h3 className="text-base font-bold leading-snug">{evt.title}</h3>
                  <div className="space-y-1 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{evt.dateLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{evt.location}</span>
                    </div>
                  </div>
                </button>

                <div
                  className="pt-3 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-decorative)' }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectEvent(evt)}
                    className="resora-focus text-xs font-bold py-2 px-2.5 rounded-[8px] cursor-pointer"
                    style={{ color: 'var(--link-focus)' }}
                  >
                    Detail kegiatan
                  </button>
                  {canScanQR && evt.status === 'Berlangsung' && (
                    <button
                      type="button"
                      onClick={() => onNavigate('scan')}
                      className="resora-focus resora-btn-primary inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-[10px] text-xs font-bold cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Scan QR</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Event Detail Sub-view
 */
function EventDetailView({ event, canScanQR, onBack, onScan }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="resora-focus inline-flex items-center gap-2 min-h-[44px] px-3 -ml-3 rounded-[12px] text-sm font-bold cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Kembali</span>
      </button>

      <article
        className="rounded-[20px] p-5 sm:p-6 space-y-5"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border-decorative)'
        }}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge type={event.statusType}>{event.status}</StatusBadge>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: '#FFF46E', color: '#333333' }}
            >
              {event.category}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold leading-snug">{event.title}</h1>
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Penyelenggara: {event.organizer}
          </p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-[14px] text-sm tabular-nums"
          style={{
            backgroundColor: 'var(--surface-subtle)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
            <div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Waktu</div>
              <div className="font-bold">{event.dateLabel}</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
            <div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Lokasi & Radius</div>
              <div className="font-bold">
                {event.location} ({event.radius})
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-sm font-bold">Deskripsi Kegiatan</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {event.description}
          </p>
        </div>

        {canScanQR && (
          <button
            type="button"
            onClick={onScan}
            className="resora-focus resora-btn-primary w-full sm:w-auto h-12 px-6 rounded-[12px] font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <QrCode className="w-5 h-5" aria-hidden="true" />
            <span>Scan QR Absen Sekarang</span>
          </button>
        )}
      </article>
    </div>
  );
}

// ============================================================================
// PAGE 2: INBOX (PENGUMUMAN RESMI + PRESERVED FILTER + MUAT LAGI)
// ============================================================================

function InboxPage({
  contained,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  visibleCount,
  onLoadMore,
  filterOpen,
  onSetFilterOpen,
  selectedAnnouncement,
  onSelectAnnouncement
}) {
  const categories = ['Semua', 'Wajib', 'Asrama', 'Kepanitiaan'];

  const filtered = useMemo(() => {
    return ANNOUNCEMENTS.filter((item) => {
      const matchCat = category === 'Semua' || item.category === category;
      const q = query.trim().toLowerCase();
      const matchQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.sender.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [query, category]);

  const displayed = filtered.slice(0, visibleCount);
  const hasMore = displayed.length < filtered.length;

  if (selectedAnnouncement) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => onSelectAnnouncement(null)}
          className="resora-focus inline-flex items-center gap-2 min-h-[44px] px-3 -ml-3 rounded-[12px] text-sm font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Kembali ke Inbox</span>
        </button>

        <article
          className="rounded-[20px] p-5 sm:p-6 space-y-4"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: selectedAnnouncement.category === 'Wajib' ? '#FF6F6F' : '#FFF46E',
                color: '#333333'
              }}
            >
              {selectedAnnouncement.category}
            </span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {selectedAnnouncement.dateLabel}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold leading-snug">
            {selectedAnnouncement.title}
          </h1>

          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Dikirim oleh: {selectedAnnouncement.sender}
          </p>

          <hr style={{ borderColor: 'var(--border-decorative)' }} />

          <p className="text-base leading-relaxed">{selectedAnnouncement.body}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {!contained && (
        <div className="hidden min-[1200px]:block">
          <h1 className="text-[28px] font-bold tracking-tight">Inbox</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Pengumuman resmi organisasi dan informasi operasional asrama untuk kamu.
          </p>
        </div>
      )}

      {/* Search & Filter Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          />
          <label htmlFor="inbox-search" className="sr-only">
            Cari pengumuman
          </label>
          <input
            id="inbox-search"
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Cari pengumuman..."
            className="resora-focus w-full h-12 pl-10 pr-9 rounded-[12px] text-base"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-control)'
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Hapus pencarian"
              className="resora-focus absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[8px] flex items-center justify-center cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSetFilterOpen(true)}
          aria-label="Filter kategori pengumuman"
          className="resora-focus h-12 px-3.5 rounded-[12px] text-sm font-bold inline-flex items-center gap-2 shrink-0 cursor-pointer"
          style={{
            backgroundColor: category !== 'Semua' ? '#FFF46E' : 'var(--surface)',
            color: category !== 'Semua' ? '#333333' : 'var(--text-primary)',
            border: '1px solid var(--border-control)'
          }}
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          <span>Filter</span>
        </button>
      </div>

      {/* Active Filter Indicator */}
      {(category !== 'Semua' || query.trim()) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Filter aktif:</span>
          {category !== 'Semua' && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold"
              style={{ backgroundColor: '#FFF46E', color: '#333333' }}
            >
              {category}
              <button
                type="button"
                onClick={() => onCategoryChange('Semua')}
                aria-label="Hapus filter kategori"
                className="cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              onQueryChange('');
              onCategoryChange('Semua');
            }}
            className="resora-focus font-bold underline px-1 cursor-pointer"
            style={{ color: 'var(--link-focus)' }}
          >
            Reset
          </button>
        </div>
      )}

      {/* List */}
      {displayed.length === 0 ? (
        <div
          className="rounded-[16px] p-8 text-center space-y-2"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <p className="text-base font-bold">Tidak ada hasil yang cocok.</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Coba kata kunci lain atau ubah filter kategori pengumuman.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((ann) => (
            <button
              key={ann.id}
              type="button"
              onClick={() => onSelectAnnouncement(ann)}
              className="resora-focus w-full text-left rounded-[16px] p-4 space-y-2 cursor-pointer block"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border-decorative)'
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: ann.category === 'Wajib' ? '#FF6F6F' : 'var(--surface-subtle)',
                    color: ann.category === 'Wajib' ? '#333333' : 'var(--text-secondary)',
                    border: ann.category === 'Wajib' ? 'none' : '1px solid var(--border-decorative)'
                  }}
                >
                  {ann.category}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {ann.dateLabel}
                </span>
              </div>
              <h2 className="text-base font-bold leading-snug">{ann.title}</h2>
              <p className="text-sm leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                {ann.summary}
              </p>
              <div className="text-xs font-semibold pt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Oleh {ann.sender}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Muat Lagi Pagination */}
      {filtered.length > 0 && (
        <div className="pt-2 flex flex-col items-center gap-3">
          <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Menampilkan {displayed.length} dari {filtered.length} pengumuman
          </p>
          {hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="resora-focus h-11 px-6 rounded-[12px] text-sm font-bold cursor-pointer"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-control)'
              }}
            >
              Muat lagi
            </button>
          )}
        </div>
      )}

      {/* Filter Bottom Sheet / Modal */}
      <OverlayModalOrSheet
        open={filterOpen}
        onClose={() => onSetFilterOpen(false)}
        title="Filter Pengumuman"
        description="Pilih kategori pengumuman yang ingin kamu tampilkan."
        maxWidth="max-w-md"
        contained={contained}
      >
        <div className="space-y-2.5">
          {categories.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  onCategoryChange(cat);
                  onSetFilterOpen(false);
                }}
                className="resora-focus w-full min-h-[48px] px-4 rounded-[12px] flex items-center justify-between text-sm font-bold cursor-pointer"
                style={
                  active
                    ? { backgroundColor: '#FF6F6F', color: '#333333' }
                    : {
                        backgroundColor: 'var(--surface-subtle)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-decorative)'
                      }
                }
              >
                <span>{cat}</span>
                {active && <Check className="w-4 h-4" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </OverlayModalOrSheet>
    </div>
  );
}

// ============================================================================
// PAGE 3: PROFIL (IDENTITAS, RINGKASAN VISUAL & RIWAYAT + DIAGNOSIS)
// ============================================================================

function ProfilPage({ role, compact, onOpenDiagnosis }) {
  const roleMeta = ROLES.find((r) => r.id === role);

  // SVG Ring calculation for 92% personal attendance
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pct = 92;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {!compact && (
        <h1 className="hidden min-[1200px]:block text-[28px] font-bold tracking-tight">Profil</h1>
      )}

      {/* Profile Identity Card */}
      <section
        aria-label="Informasi personal"
        className="rounded-[20px] p-5 flex items-center gap-4"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border-decorative)'
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
          style={{ backgroundColor: '#A58BFF', color: '#333333' }}
          aria-hidden="true"
        >
          NF
        </div>
        <div className="space-y-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-snug truncate">Nabil Fikry Khaidar</h2>
          <p className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {roleMeta?.desc}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span
              className="text-xs font-bold px-2.5 py-0.5 rounded-full tabular-nums"
              style={{ backgroundColor: '#FFF46E', color: '#333333' }}
            >
              Periode 2026/2027
            </span>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full tabular-nums"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-decorative)'
              }}
            >
              SR-G10-042
            </span>
          </div>
        </div>
      </section>

      {/* Personal Attendance Visual Summary Card (Ring + Breakdown) */}
      <section
        aria-labelledby="heading-stat-pribadi"
        className="rounded-[20px] p-5 space-y-4"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border-decorative)'
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="heading-stat-pribadi" className="text-base font-bold">
            Statistik Kehadiran Pribadi
          </h2>
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Periode 2026/2027
          </span>
        </div>

        <div className="flex items-center gap-5">
          {/* Accessible Ring Chart */}
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 84 84" className="w-24 h-24 -rotate-90" role="img" aria-label="Tingkat kehadiran pribadi 92 persen">
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="var(--surface-subtle)"
                strokeWidth="9"
              />
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="#FF6F6F"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums leading-none">92%</span>
              <span className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Hadir
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 flex-1">
            {[
              { label: 'Hadir', value: '18', color: 'var(--success-text)', bg: 'var(--success-tint)' },
              { label: 'Terlambat', value: '2', color: 'var(--warning-text)', bg: 'var(--warning-tint)' },
              { label: 'Izin', value: '1', color: 'var(--info-text)', bg: 'var(--info-tint)' }
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[14px] p-2.5 text-center"
                style={{
                  backgroundColor: stat.bg,
                  border: '1px solid var(--border-decorative)'
                }}
              >
                <div className="text-xl font-bold tabular-nums" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="text-[11px] font-bold mt-0.5" style={{ color: stat.color }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Personal Attendance History */}
      <section aria-labelledby="heading-riwayat" className="space-y-3">
        <h2 id="heading-riwayat" className="text-base font-bold">
          Riwayat Absensi Pribadi
        </h2>

        <div className="space-y-3">
          {ATTENDANCE_HISTORY.map((item) => (
            <div
              key={item.id}
              className="rounded-[16px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border-decorative)'
              }}
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge type={item.statusType}>{item.status}</StatusBadge>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {item.dateLabel}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold leading-snug">{item.eventTitle}</h3>
                <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{item.location}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenDiagnosis(`Diagnosis: ${item.eventTitle}`, item.diagnosis)}
                className="resora-focus inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-[12px] text-xs font-bold shrink-0 cursor-pointer self-start sm:self-center"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-control)'
                }}
              >
                <Info className="w-4 h-4" aria-hidden="true" />
                <span>Lihat diagnosis</span>
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// PAGE 4: SCAN QR FULL-SCREEN (100dvh / FULL PHONE FRAME)
// ============================================================================

function ScanQRFullScreen({ contained, onBack, onShowToast, onOpenDiagnosis }) {
  const [scanState, setScanState] = useState('scanning'); // 'scanning' | 'submitting' | 'success' | 'outside_geofence' | 'camera_denied'
  const [zoom, setZoom] = useState(1);

  const simulateFlow = (target) => {
    if (target === 'camera_denied') {
      setScanState('camera_denied');
      return;
    }
    setScanState('submitting');
    setTimeout(() => {
      setScanState(target);
    }, 550);
  };

  return (
    <div
      className={`${contained ? 'h-full' : 'min-h-[100dvh]'} w-full flex flex-col justify-between bg-[#141414] text-[#F6F6F6] overflow-y-auto`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="resora-focus inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full text-sm font-bold cursor-pointer bg-[#2C2C2C] text-[#F6F6F6] border border-[#969696]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Kembali</span>
        </button>

        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums bg-[#2C2C2C] border border-[#424242]"
          role="status"
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: scanState === 'outside_geofence' ? '#FDE047' : '#86EFAC' }}
            aria-hidden="true"
          />
          <span>GPS Aktif · 11 m</span>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-3">
        {scanState === 'scanning' && (
          <div className="w-full max-w-xs flex flex-col items-center space-y-4">
            {/* Viewfinder */}
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-[24px] overflow-hidden border-2 border-[#FF6F6F] bg-[#1E1E1E] flex items-center justify-center">
              <div
                className="transition-transform duration-150 opacity-35"
                style={{ transform: `scale(${zoom})` }}
                aria-hidden="true"
              >
                <QrCode className="w-28 h-28 text-[#F6F6F6]" strokeWidth={1.2} />
              </div>

              <div className="absolute top-3 left-3 w-6 h-6 border-t-4 border-l-4 border-[#FFF46E] rounded-tl-[8px]" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-4 border-r-4 border-[#FFF46E] rounded-tr-[8px]" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-4 border-l-4 border-[#FFF46E] rounded-bl-[8px]" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-4 border-r-4 border-[#FFF46E] rounded-br-[8px]" />

              <span className="absolute bottom-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-black/80 text-[#F6F6F6] tabular-nums">
                Zoom {zoom.toFixed(1)}x
              </span>
            </div>

            <p className="text-xs sm:text-sm text-center text-[#BDBDBD]">
              Arahkan kamera ke kode QR kegiatan yang ditampilkan pengurus.
            </p>

            {/* Working Zoom Controls */}
            <div className="w-full rounded-[16px] p-3 bg-[#222222] border border-[#424242] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="scanner-zoom" className="font-semibold text-[#BDBDBD]">
                  Zoom Kamera
                </label>
                <span className="font-bold tabular-nums text-[#FFF46E]">{zoom.toFixed(1)}x</span>
              </div>

              <div className="flex items-center gap-2">
                <ZoomOut className="w-4 h-4 text-[#BDBDBD] shrink-0" aria-hidden="true" />
                <input
                  id="scanner-zoom"
                  type="range"
                  min={1}
                  max={2}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="resora-focus flex-1 accent-[#FF6F6F] cursor-pointer"
                />
                <ZoomIn className="w-4 h-4 text-[#BDBDBD] shrink-0" aria-hidden="true" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[1, 1.5, 2].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setZoom(preset)}
                    aria-pressed={zoom === preset}
                    className="resora-focus min-h-[40px] rounded-[10px] text-xs font-bold tabular-nums cursor-pointer"
                    style={
                      zoom === preset
                        ? { backgroundColor: '#FF6F6F', color: '#333333' }
                        : { backgroundColor: '#303030', color: '#F6F6F6' }
                    }
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {scanState === 'submitting' && (
          <div className="w-full max-w-xs rounded-[24px] p-6 bg-[#222222] border border-[#424242] text-center space-y-4">
            <div className="w-11 h-11 mx-auto rounded-full border-4 border-[#424242] border-t-[#FF6F6F] animate-spin" />
            <div className="space-y-1">
              <h1 className="text-base font-bold">Memverifikasi absensi...</h1>
              <p className="text-xs text-[#BDBDBD]">
                Sedang mengirim kode QR dan memeriksa lokasi kamu ke server.
              </p>
            </div>
          </div>
        )}

        {scanState === 'success' && (
          <div className="w-full max-w-md rounded-[24px] p-5 bg-[#222222] border border-[#424242] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-[#14291E] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-[#86EFAC]" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#86EFAC]">Absen berhasil dicatat.</h1>
                <p className="text-xs text-[#BDBDBD] mt-0.5">
                  Kehadiran kamu sudah terkonfirmasi oleh server RESORA.
                </p>
              </div>
            </div>

            <div className="rounded-[14px] p-3.5 bg-[#2C2C2C] border border-[#424242] space-y-2 text-xs tabular-nums">
              <div className="flex justify-between gap-2">
                <span className="text-[#BDBDBD]">Kegiatan</span>
                <span className="font-bold text-right">Rapat Koordinasi Gedung 10</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#BDBDBD]">Waktu tercatat</span>
                <span className="font-bold text-right">26 Nov 2026, 12.35 WIB</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#BDBDBD]">Status</span>
                <span className="font-bold text-[#86EFAC]">Hadir</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => onOpenDiagnosis('Diagnosis Absensi Berhasil', SUCCESS_SCAN_DIAGNOSIS)}
                className="resora-focus flex-1 h-12 rounded-[12px] text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-[#303030] text-[#F6F6F6] border border-[#969696] cursor-pointer"
              >
                <Info className="w-4 h-4" aria-hidden="true" />
                <span>Lihat diagnosis</span>
              </button>
              <button
                type="button"
                onClick={onBack}
                className="resora-focus resora-btn-primary flex-1 h-12 rounded-[12px] text-xs font-bold cursor-pointer"
              >
                Kembali ke Beranda
              </button>
            </div>
          </div>
        )}

        {scanState === 'outside_geofence' && (
          <div className="w-full max-w-md rounded-[24px] p-4 sm:p-5 bg-[#222222] border border-[#424242] space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#331717] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#FCA5A5]" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-base font-bold text-[#FCA5A5]">Di luar area kegiatan</h1>
                <p className="text-xs text-[#F6F6F6] mt-1 leading-relaxed">
                  Lokasi kamu terdeteksi di luar area kegiatan. Kalau sudah di lokasi, perbarui lokasi lalu coba lagi.
                </p>
              </div>
            </div>

            {/* Directly visible copyable Diagnosis Block */}
            <DiagnosisBlock text={OUTSIDE_GEOFENCE_DIAGNOSIS} onCopied={onShowToast} />

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => setScanState('scanning')}
                className="resora-focus resora-btn-primary flex-1 h-12 rounded-[12px] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Perbarui lokasi & scan ulang</span>
              </button>
              <button
                type="button"
                onClick={onBack}
                className="resora-focus h-12 px-4 rounded-[12px] text-xs font-bold bg-[#303030] text-[#F6F6F6] border border-[#969696] cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {scanState === 'camera_denied' && (
          <div className="w-full max-w-xs rounded-[24px] p-5 bg-[#222222] border border-[#424242] space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#331717] flex items-center justify-center">
              <CameraOff className="w-6 h-6 text-[#FCA5A5]" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-base font-bold">Izin kamera belum aktif</h1>
              <p className="text-xs text-[#BDBDBD] leading-relaxed">
                RESORA butuh akses kamera untuk memindai QR absensi. Buka pengaturan browser perangkat kamu, izinkan kamera, lalu tekan Coba lagi.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setScanState('scanning')}
                className="resora-focus resora-btn-primary w-full h-12 rounded-[12px] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Coba lagi</span>
              </button>
              <button
                type="button"
                onClick={onBack}
                className="resora-focus w-full h-11 rounded-[12px] text-xs font-bold bg-[#303030] text-[#F6F6F6] border border-[#969696] cursor-pointer"
              >
                Kembali
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Simulation Switcher Footer */}
      <footer className="px-4 py-3 border-t border-[#303030] bg-[#181818] shrink-0">
        <div className="max-w-md mx-auto space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#BDBDBD] text-center">
            Simulasi Status Scanner
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => simulateFlow('success')}
              className="resora-focus min-h-[42px] px-2 rounded-[10px] text-[11px] font-bold bg-[#14291E] text-[#86EFAC] border border-[#86EFAC]/50 cursor-pointer"
            >
              Berhasil
            </button>
            <button
              type="button"
              onClick={() => simulateFlow('outside_geofence')}
              className="resora-focus min-h-[42px] px-2 rounded-[10px] text-[11px] font-bold bg-[#2E2410] text-[#FDE047] border border-[#FDE047]/50 cursor-pointer"
            >
              Di Luar Radius
            </button>
            <button
              type="button"
              onClick={() => simulateFlow('camera_denied')}
              className="resora-focus min-h-[42px] px-2 rounded-[10px] text-[11px] font-bold bg-[#331717] text-[#FCA5A5] border border-[#FCA5A5]/50 cursor-pointer"
            >
              Kamera Ditolak
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// PAGE 5: FORM BUAT KEGIATAN (LOCAL DRAFT RECOVERY + INLINE VALIDATION)
// ============================================================================

function CreateEventFormPage({ contained, onBack, onShowToast, onDraftStateChange }) {
  const initialValues = {
    title: '',
    date: '2026-11-28',
    time: '19:00',
    location: '',
    radius: '20',
    notes: ''
  };

  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [restoredDraftTime, setRestoredDraftTime] = useState(null);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [submittedEvent, setSubmittedEvent] = useState(null);

  const isDirty = useMemo(() => {
    return (
      values.title.trim() !== '' ||
      values.location.trim() !== '' ||
      values.notes.trim() !== ''
    );
  }, [values]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.values) {
          setValues((prev) => ({ ...prev, ...parsed.values }));
          setRestoredDraftTime(parsed.savedAt || 'baru saja');
          setLastSavedTime(parsed.savedAt || null);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    onDraftStateChange(isDirty && !submittedEvent);
    return () => onDraftStateChange(false);
  }, [isDirty, submittedEvent, onDraftStateChange]);

  useEffect(() => {
    if (!isDirty || submittedEvent) return;
    const timer = setTimeout(() => {
      try {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        });
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({ schemaVersion: 1, savedAt: `${timeStr} WIB`, values })
        );
        setLastSavedTime(`${timeStr} WIB`);
      } catch {
        onShowToast('Draf belum tersimpan di perangkat ini. Jangan tutup halaman dulu.');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [values, isDirty, submittedEvent, onShowToast]);

  const handleClearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setValues(initialValues);
    setErrors({});
    setRestoredDraftTime(null);
    setLastSavedTime(null);
    setConfirmDeleteOpen(false);
    onShowToast('Draf di perangkat ini dihapus.');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!values.title.trim()) nextErrors.title = 'Isi nama kegiatan dulu.';
    if (!values.location.trim()) nextErrors.location = 'Isi lokasi kegiatan dulu.';
    const radiusNum = Number(values.radius);
    if (!values.radius || Number.isNaN(radiusNum) || radiusNum < 5 || radiusNum > 500) {
      nextErrors.radius = 'Radius harus di antara 5 sampai 500 meter.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstKey = Object.keys(nextErrors)[0];
      document.getElementById(`field-${firstKey}`)?.focus();
      return;
    }

    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setRestoredDraftTime(null);
    setLastSavedTime(null);
    setSubmittedEvent({ ...values });
    onShowToast('Kegiatan berhasil disimpan.');
  };

  if (submittedEvent) {
    return (
      <div className="max-w-[640px] mx-auto space-y-4">
        <div
          className="rounded-[20px] p-6 space-y-4"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-7 h-7 shrink-0" style={{ color: 'var(--success-text)' }} aria-hidden="true" />
            <div>
              <h1 className="text-xl font-bold">Kegiatan berhasil disimpan.</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Draf lokal otomatis dibersihkan setelah konfirmasi server.
              </p>
            </div>
          </div>

          <div
            className="rounded-[12px] p-4 text-sm space-y-1 tabular-nums"
            style={{ backgroundColor: 'var(--surface-subtle)' }}
          >
            <div className="font-bold text-base">{submittedEvent.title}</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {submittedEvent.date} · {submittedEvent.time} WIB
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {submittedEvent.location} (Radius {submittedEvent.radius} m)
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={onBack}
              className="resora-focus resora-btn-primary h-12 px-5 rounded-[12px] text-sm font-bold cursor-pointer"
            >
              Kembali ke Beranda
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmittedEvent(null);
                setValues(initialValues);
              }}
              className="resora-focus h-12 px-5 rounded-[12px] text-sm font-bold cursor-pointer"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-control)'
              }}
            >
              Buat kegiatan lain
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="resora-focus inline-flex items-center gap-2 min-h-[44px] px-3 -ml-3 rounded-[12px] text-sm font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Kembali</span>
        </button>

        {lastSavedTime && (
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Draf lokal {lastSavedTime}
          </span>
        )}
      </div>

      {!contained && (
        <div className="hidden min-[1200px]:block">
          <h1 className="text-[28px] font-bold tracking-tight">Buat Kegiatan</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Isian kamu tersimpan otomatis sebagai draf di perangkat ini sampai kamu menekan Simpan kegiatan.
          </p>
        </div>
      )}

      {/* Draft Restored Banner */}
      {(restoredDraftTime || lastSavedTime) && isDirty && (
        <div
          role="status"
          className="rounded-[16px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--info-tint)',
            border: '1px solid var(--border-decorative)'
          }}
        >
          <div className="flex items-start gap-2.5">
            <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--info-text)' }} aria-hidden="true" />
            <div className="text-xs sm:text-sm">
              <div className="font-bold" style={{ color: 'var(--info-text)' }}>
                Draf di perangkat ini dipulihkan. Belum dikirim.
              </div>
              <div className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                Terakhir disimpan: {lastSavedTime || restoredDraftTime}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="resora-focus inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-[12px] text-xs font-bold shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--danger-text)',
              border: '1px solid var(--border-control)'
            }}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Hapus draf</span>
          </button>
        </div>
      )}

      {/* Single-Column Form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-[20px] p-5 sm:p-6 space-y-4"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border-decorative)'
        }}
      >
        {/* Nama Kegiatan */}
        <div className="space-y-1.5">
          <label htmlFor="field-title" className="block text-sm font-bold">
            Nama kegiatan <span style={{ color: 'var(--danger-text)' }}>*</span>
          </label>
          <input
            id="field-title"
            type="text"
            required
            value={values.title}
            onChange={(e) => {
              setValues((v) => ({ ...v, title: e.target.value }));
              if (errors.title) setErrors((err) => ({ ...err, title: undefined }));
            }}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'error-title' : 'hint-title'}
            placeholder="Contoh: Rapat Koordinasi Gedung 10"
            className="resora-focus w-full h-12 px-3.5 rounded-[12px] text-base"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: `1px solid ${errors.title ? 'var(--danger-text)' : 'var(--border-control)'}`
            }}
          />
          {errors.title ? (
            <p id="error-title" className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--danger-text)' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.title}</span>
            </p>
          ) : (
            <p id="hint-title" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Gunakan nama kegiatan yang jelas agar mudah dikenali anggota.
            </p>
          )}
        </div>

        {/* Tanggal & Jam (WIB) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="field-date" className="block text-sm font-bold">
              Tanggal (WIB) <span style={{ color: 'var(--danger-text)' }}>*</span>
            </label>
            <input
              id="field-date"
              type="date"
              value={values.date}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
              className="resora-focus w-full h-12 px-3.5 rounded-[12px] text-base tabular-nums"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-control)'
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="field-time" className="block text-sm font-bold">
              Waktu mulai (WIB) <span style={{ color: 'var(--danger-text)' }}>*</span>
            </label>
            <input
              id="field-time"
              type="time"
              value={values.time}
              onChange={(e) => setValues((v) => ({ ...v, time: e.target.value }))}
              className="resora-focus w-full h-12 px-3.5 rounded-[12px] text-base tabular-nums"
              style={{
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-control)'
              }}
            />
          </div>
        </div>

        {/* Lokasi */}
        <div className="space-y-1.5">
          <label htmlFor="field-location" className="block text-sm font-bold">
            Lokasi kegiatan <span style={{ color: 'var(--danger-text)' }}>*</span>
          </label>
          <input
            id="field-location"
            type="text"
            required
            value={values.location}
            onChange={(e) => {
              setValues((v) => ({ ...v, location: e.target.value }));
              if (errors.location) setErrors((err) => ({ ...err, location: undefined }));
            }}
            aria-invalid={Boolean(errors.location)}
            aria-describedby={errors.location ? 'error-location' : undefined}
            placeholder="Contoh: Aula Lantai 1, Gedung 10"
            className="resora-focus w-full h-12 px-3.5 rounded-[12px] text-base"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: `1px solid ${errors.location ? 'var(--danger-text)' : 'var(--border-control)'}`
            }}
          />
          {errors.location && (
            <p id="error-location" className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--danger-text)' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.location}</span>
            </p>
          )}
        </div>

        {/* Radius Geofence */}
        <div className="space-y-1.5">
          <label htmlFor="field-radius" className="block text-sm font-bold">
            Radius geofence (meter) <span style={{ color: 'var(--danger-text)' }}>*</span>
          </label>
          <input
            id="field-radius"
            type="number"
            inputMode="numeric"
            min={5}
            max={500}
            value={values.radius}
            onChange={(e) => {
              setValues((v) => ({ ...v, radius: e.target.value }));
              if (errors.radius) setErrors((err) => ({ ...err, radius: undefined }));
            }}
            aria-invalid={Boolean(errors.radius)}
            aria-describedby={errors.radius ? 'error-radius' : 'hint-radius'}
            className="resora-focus w-full h-12 px-3.5 rounded-[12px] text-base tabular-nums"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: `1px solid ${errors.radius ? 'var(--danger-text)' : 'var(--border-control)'}`
            }}
          />
          {errors.radius ? (
            <p id="error-radius" className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--danger-text)' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.radius}</span>
            </p>
          ) : (
            <p id="hint-radius" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Rekomendasi area dalam gedung: 20 sampai 30 meter.
            </p>
          )}
        </div>

        {/* Catatan */}
        <div className="space-y-1.5">
          <label htmlFor="field-notes" className="block text-sm font-bold">
            Catatan tambahan (opsional)
          </label>
          <textarea
            id="field-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            placeholder="Perlengkapan yang perlu dibawa atau agenda singkat..."
            className="resora-focus w-full p-3.5 rounded-[12px] text-base"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-control)'
            }}
          />
        </div>

        {/* Submit Actions */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBack}
            className="resora-focus h-12 px-5 rounded-[12px] text-sm font-bold cursor-pointer"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-control)'
            }}
          >
            Batal
          </button>
          <button
            type="submit"
            className="resora-focus resora-btn-primary flex-1 h-12 px-6 rounded-[12px] text-sm font-bold cursor-pointer"
          >
            Simpan kegiatan
          </button>
        </div>
      </form>

      {/* Confirmation Sheet/Modal for Hapus Draf */}
      <OverlayModalOrSheet
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Hapus draf ini?"
        description="Isian yang belum dikirim akan dihapus dari perangkat ini."
        maxWidth="max-w-md"
        contained={contained}
      >
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="resora-focus flex-1 h-12 rounded-[12px] text-sm font-bold cursor-pointer"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-control)'
            }}
          >
            Lanjut mengisi
          </button>
          <button
            type="button"
            onClick={handleClearDraft}
            className="resora-focus flex-1 h-12 rounded-[12px] text-sm font-bold cursor-pointer"
            style={{
              backgroundColor: '#B91C1C',
              color: '#FFFFFF'
            }}
          >
            Hapus draf
          </button>
        </div>
      </OverlayModalOrSheet>
    </div>
  );
}

// ============================================================================
// SECONDARY MODULES
// ============================================================================

function EventsModulePage({ selectedEvent, onSelectEvent, onCreateEvent, onScan, canScanQR, isPengurusOrAdmin }) {
  if (selectedEvent) {
    return (
      <EventDetailView
        event={selectedEvent}
        canScanQR={canScanQR}
        onBack={() => onSelectEvent(null)}
        onScan={onScan}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Daftar Jadwal & Kegiatan</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Periode 2026/2027 · Zona waktu WIB
          </p>
        </div>
        {isPengurusOrAdmin && (
          <button
            type="button"
            onClick={onCreateEvent}
            className="resora-focus resora-btn-primary h-11 px-4 rounded-[12px] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Buat kegiatan</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {UPCOMING_EVENTS.map((evt) => (
          <button
            key={evt.id}
            type="button"
            onClick={() => onSelectEvent(evt)}
            className="resora-focus w-full text-left rounded-[16px] p-4 cursor-pointer block"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border-decorative)'
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge type={evt.statusType}>{evt.status}</StatusBadge>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {evt.category}
                  </span>
                </div>
                <h3 className="text-base font-bold">{evt.title}</h3>
                <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {evt.dateLabel} · {evt.location}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 mt-1" style={{ color: 'var(--text-secondary)' }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SecondaryModulePage({ pageId, isPengurusOrAdmin, onNavigate }) {
  const adminOnly = pageId === 'users' || pageId === 'periods';

  if (adminOnly && !isPengurusOrAdmin) {
    return (
      <div
        className="max-w-lg mx-auto rounded-[20px] p-6 text-center space-y-4"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border-decorative)'
        }}
      >
        <div
          className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--danger-tint)', color: 'var(--danger-text)' }}
        >
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold">Kamu belum punya akses ke fitur ini.</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Halaman ini khusus untuk peran Pengurus atau Admin. Ubah peran demo di bagian atas untuk meninjau tampilan ini.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('beranda')}
          className="resora-focus resora-btn-primary h-11 px-5 rounded-[12px] text-sm font-bold cursor-pointer"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const meta = {
    committees: {
      title: 'Kepanitiaan',
      desc: 'Daftar kepanitiaan aktif dan penugasan divisi periode 2026/2027.',
      items: [
        { name: 'Panitia Malam Keakraban 2026', role: 'Koordinator Lapangan', status: 'Aktif', type: 'success' },
        { name: 'Tim Evaluasi Kebersihan Gedung 10', role: 'Anggota', status: 'Aktif', type: 'info' }
      ]
    },
    points: {
      title: 'Rekap Poin',
      desc: 'Rekapitulasi poin kegiatan terkonfirmasi (Triwulan I 2026/2027).',
      items: [
        { name: 'Kehadiran Kegiatan Wajib (18 sesi)', role: '+36 poin', status: 'Terkonfirmasi', type: 'success' },
        { name: 'Kontribusi Kepanitiaan Aktif', role: '+12 poin', status: 'Terkonfirmasi', type: 'success' }
      ]
    },
    users: {
      title: 'Kelola Akun',
      desc: 'Manajemen peran, departemen, dan status aktif anggota asrama.',
      items: [
        { name: 'Nabil Fikry Khaidar', role: 'Senior Resident · Gedung 10', status: 'Aktif', type: 'success' },
        { name: 'Raka Pratama', role: 'Pengurus Operasional · Gedung 9', status: 'Aktif', type: 'success' }
      ]
    },
    periods: {
      title: 'Periode',
      desc: 'Pengaturan periode kepengurusan dan rentang waktu operasional.',
      items: [
        { name: 'Periode 2026/2027', role: 'Sep 2026 sampai Agu 2027', status: 'Berjalan', type: 'success' },
        { name: 'Periode 2025/2026', role: 'Sep 2025 sampai Agu 2026', status: 'Arsip', type: 'neutral' }
      ]
    }
  }[pageId];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{meta.title}</h2>
        <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {meta.desc}
        </p>
      </div>

      <div className="space-y-3">
        {meta.items.map((item) => (
          <div
            key={item.name}
            className="rounded-[16px] p-4 flex items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border-decorative)'
            }}
          >
            <div>
              <div className="font-bold text-sm sm:text-base">{item.name}</div>
              <div className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {item.role}
              </div>
            </div>
            <StatusBadge type={item.type}>{item.status}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}
