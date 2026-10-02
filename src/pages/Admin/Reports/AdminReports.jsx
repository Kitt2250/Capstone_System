import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import './AdminReports.css';
import Header from '../../../components/Header/Header';
import Pagination from '../../../components/Pagination/Pagination';

function toDateStr(v) {
  if (!v) return '';
  try { if (v.toDate) return v.toDate().toISOString().split('T')[0]; } catch {}
  if (typeof v === 'string') return v.split('T')[0];
  return '';
}

function downloadCSV(data, filename = 'report.csv') {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => {
      let val = row[header];
      if (val === null || val === undefined) val = '';
      if (typeof val === 'object') val = JSON.stringify(val);
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── real data lives in component state, not static arrays


export default function AdminReports() {
    const [currentTab, setCurrentTab] = useState('financial');
    const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });

    // Firestore collections
    const [plots, setPlots]             = useState([]);
    const [burials, setBurials]         = useState([]);
    const [payments, setPayments]       = useState([]);
    const [payHist, setPayHist]         = useState([]);
    const [wakeRentals, setWakeRentals] = useState([]);

    useEffect(() => {
        let ok = true;
        const subs = [
            onSnapshot(collection(db, 'plots'),           s => { if (ok) setPlots(s.docs.map(d => ({ id: d.id, ...d.data() }))); }),
            onSnapshot(collection(db, 'burials'),         s => { if (ok) setBurials(s.docs.map(d => ({ id: d.id, ...d.data() }))); }),
            onSnapshot(collection(db, 'payments'),        s => { if (ok) setPayments(s.docs.map(d => ({ id: d.id, ...d.data() }))); }),
            onSnapshot(collection(db, 'payment_history'), s => { if (ok) setPayHist(s.docs.map(d => ({ id: d.id, ...d.data() }))); }),
            onSnapshot(collection(db, 'wakeSpaceRental'), s => { if (ok) setWakeRentals(s.docs.map(d => ({ id: d.id, ...d.data() }))); }),
        ];
        return () => { ok = false; subs.forEach(u => u()); };
    }, []);

    const today = new Date().toISOString().split('T')[0];

    // ── FINANCIAL ──────────────────────────────────────────────────────────────
    const financialTransactions = useMemo(() => {
        const histItems = payHist.map(h => ({
            id: h.id,
            date: toDateStr(h.payment_date || h.created_at) || '—',
            transaction: h.description || h.reference_number || h.id,
            category: h.payment_type || h.category || 'Lot / Services',
            amount: Number(h.amount || 0),
            type: 'income',
            sortDate: toDateStr(h.payment_date || h.created_at)
        }));

        // Include wake rentals with price
        const wakeItems = wakeRentals
            .filter(r => (r.status || '').toLowerCase() !== 'cancelled')
            .map(r => {
                const amt = Number(r.totalPrice || r.price || r.amount || r.total_price || 0);
                const d = toDateStr(r.createdAt || r.startDate) || '—';
                const name = r.spaceName || (r.spaceId ? `Wake Space ${r.spaceId}` : (r.wake ? `Wake Room ${r.wake}` : 'Wake Space Rental'));
                const client = r.client ? ` - ${r.client}` : '';
                return {
                    id: r.id,
                    date: d,
                    transaction: `${r.bookingId || 'Booking'}: ${name}${client}`,
                    category: 'Wake Space',
                    amount: amt,
                    type: 'income',
                    sortDate: d
                };
            });

        const histRefs = new Set(payHist.map(h => String(h.reference_number || h.description || '').toLowerCase()));
        const uniqueWake = wakeItems.filter(w => !histRefs.has(String(w.transaction).toLowerCase()) && !histRefs.has(String(w.id).toLowerCase()));

        return [...histItems, ...uniqueWake].sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));
    }, [payHist, wakeRentals]);

    const financialData = useMemo(() => {
        const map = {};
        payHist.forEach(h => {
            const d = toDateStr(h.payment_date || h.created_at);
            const label = d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?';
            if (!map[label]) map[label] = { label, revenue: 0, expenses: 0 };
            map[label].revenue += Number(h.amount || 0);
        });
        wakeRentals.forEach(r => {
            if ((r.status || '').toLowerCase() === 'cancelled') return;
            const amt = Number(r.totalPrice || r.price || r.amount || r.total_price || 0);
            const d = toDateStr(r.createdAt || r.startDate);
            const label = d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?';
            if (!map[label]) map[label] = { label, revenue: 0, expenses: 0 };
            map[label].revenue += amt;
        });
        return Object.values(map).slice(-7);
    }, [payHist, wakeRentals]);

    // ── BURIAL ─────────────────────────────────────────────────────────────────
    const burialData = useMemo(() => {
        const colors = ['#d4af37','#3670AF','#27ae60','#8e44ad','#c0392b','#e67e22'];
        const map = {};
        burials.forEach(b => {
            let t = b.graveType || b.grave_type || '';
            if (!t) {
                const bPlotId = String(b.plot_id || b.plotId || '').trim();
                const bPlotNum = String(b.plot_number || b.plotNumber || b.plot_code || b.plotCode || b.plot || '').trim().toLowerCase();
                const p = plots.find(pl => {
                    const plId = String(pl.id || '').trim();
                    const plCode = String(pl.plotCode || pl.name || '').trim().toLowerCase();
                    return (bPlotId && (plId === bPlotId || plCode === bPlotId.toLowerCase())) ||
                           (bPlotNum && (plId.toLowerCase() === bPlotNum || plCode === bPlotNum));
                });
                if (p) {
                    t = p.graveType || p.grave_type || '';
                    if (!t) {
                        const code = String(p.plotCode || p.name || p.id || '').toUpperCase();
                        if (code.startsWith('AP')) t = 'Apartment';
                        else if (code.startsWith('SN')) t = 'Single Niche';
                        else if (code.startsWith('MA')) t = 'Mausoleum';
                        else if (code.startsWith('CO')) t = 'Columbarium';
                        else if (code.startsWith('BV')) t = 'Bone Vault';
                        else if (code.startsWith('LL') || code.startsWith('GB') || code.startsWith('LG')) t = 'Lawn Lot';
                    }
                } else if (bPlotNum) {
                    const code = bPlotNum.toUpperCase();
                    if (code.startsWith('AP')) t = 'Apartment';
                    else if (code.startsWith('SN')) t = 'Single Niche';
                    else if (code.startsWith('MA')) t = 'Mausoleum';
                    else if (code.startsWith('CO')) t = 'Columbarium';
                    else if (code.startsWith('BV')) t = 'Bone Vault';
                }
            }
            if (!t) t = 'Ground Grave';
            map[t] = (map[t] || 0) + 1;
        });
        return Object.entries(map).map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
    }, [burials, plots]);

    // ── OCCUPANCY ──────────────────────────────────────────────────────────────
    const occupancyData = useMemo(() => {
        const map = {};
        plots.forEach(p => {
            let t = p.graveType || p.grave_type || '';
            if (!t) { const c = String(p.plotCode || p.id || '').toUpperCase(); t = c.startsWith('AP') ? 'Apartment' : c.startsWith('SN') ? 'Single Niche' : c.startsWith('MA') ? 'Mausoleum' : 'Other'; }
            if (!map[t]) map[t] = { label: t, avail: 0, occ: 0, res: 0 };
            const s = (p.status || '').toLowerCase();
            if (s === 'available') map[t].avail++; else if (s === 'occupied' || s === 'partial') map[t].occ++; else if (s === 'reserved') map[t].res++;
        });
        return Object.values(map);
    }, [plots]);

    const occupancyTable = useMemo(() => {
        const map = {};
        plots.forEach(p => {
            const sec = p.section || 'N/A';
            if (!map[sec]) map[sec] = { section: sec, total: 0, avail: 0, occ: 0, res: 0 };
            map[sec].total++;
            const s = (p.status || '').toLowerCase();
            if (s === 'available') map[sec].avail++; else if (s === 'occupied' || s === 'partial') map[sec].occ++; else if (s === 'reserved') map[sec].res++;
        });
        return Object.values(map).map(r => ({ ...r, rate: r.total > 0 ? Math.round((r.occ / r.total) * 100) + '%' : '0%' })).sort((a, b) => a.section.localeCompare(b.section));
    }, [plots]);

    // ── COLLECTIONS ────────────────────────────────────────────────────────────
    const overdueTable = useMemo(() =>
        payments
            .filter(p => { const s = (p.payment_status || '').toLowerCase(); const due = p.due_date || p.next_due_date || ''; return s === 'overdue' || (due && due < today && Number(p.balance || 0) > 0 && s !== 'paid'); })
            .map(p => {
                const due = p.due_date || p.next_due_date || '';
                const days = due ? Math.floor((new Date(today) - new Date(due)) / 86400000) : 0;
                const lp = plots.find(pl => pl.id === p.plot_id);
                return { client: p.client_name || p.owner_name || '—', lot: (lp && lp.plotCode) || p.plot_id || '—', amount: Number(p.balance || p.monthly_installment || 0), overdueSince: due || '—', days, status: days > 60 ? 'Critical' : days > 30 ? 'Overdue' : 'Overdue', statusClass: days > 60 ? 'status-critical' : 'status-warn' };
            }).sort((a, b) => b.days - a.days),
    [payments, plots, today]);

    const overdueData = useMemo(() => {
        const b = { '1-30d': 0, '31-60d': 0, '61-90d': 0, '90d+': 0 };
        overdueTable.forEach(r => { if (r.days <= 30) b['1-30d']++; else if (r.days <= 60) b['31-60d']++; else if (r.days <= 90) b['61-90d']++; else b['90d+']++; });
        const colors = ['#f39c12','#e67e22','#c0392b','#8e44ad'];
        return Object.entries(b).map(([label, value], i) => ({ label, value, color: colors[i] }));
    }, [overdueTable]);

    // ── RENEWALS ───────────────────────────────────────────────────────────────
    const renewalTable = useMemo(() => {
        const rows = [];
        plots.forEach(p => {
            if (p.contract === 'Perpetual' || p.contract_type === 'Perpetual' || p.is_perpetual) return;
            let exp = p.contract_expiration_date;
            if (!exp && p.contract_start_date) { const d = new Date(p.contract_start_date); if (!isNaN(d)) { d.setFullYear(d.getFullYear() + Number(p.contract_years || 7)); exp = d.toISOString().split('T')[0]; } }
            if (!exp) return;
            const dl = Math.ceil((new Date(exp) - new Date(today)) / 86400000);
            if (dl > 365 || dl < -30) return;
            rows.push({ lot: p.plotCode || p.name || p.id, client: p.owner || '—', expiry: exp, days: dl < 0 ? Math.abs(dl) + ' days ago' : dl + ' days', color: dl < 0 ? '#c0392b' : dl <= 7 ? '#e74c3c' : dl <= 30 ? '#f39c12' : '#27ae60', status: dl < 0 ? 'Expired' : dl <= 7 ? 'Urgent' : dl <= 30 ? 'Expiring' : 'Upcoming', statusClass: dl < 0 ? 'status-critical' : dl <= 7 ? 'status-warn' : dl <= 30 ? 'status-info' : 'status-ok', _dl: dl });
        });
        return rows.sort((a, b) => a._dl - b._dl);
    }, [plots, today]);

    const renewalData = useMemo(() => {
        const months = [];
        for (let i = 0; i < 6; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0'); const label = d.toLocaleString('en-US',{month:'short'}); const value = renewalTable.filter(r => r.expiry && r.expiry.startsWith(key) && r._dl >= 0).length; months.push({ label, value }); }
        return months;
    }, [renewalTable]);

    // ── SUMMARY METRICS DERIVED FROM BACKEND ────────────────────────────────────
    const financialStats = useMemo(() => {
        let lotSales = 0;
        let expenses = 0;
        let payHistWake = 0;

        payHist.forEach(h => {
            const amt = Number(h.amount || 0);
            if (h.type === 'expense' || amt < 0) {
                expenses += Math.abs(amt);
            } else {
                const cat = (h.category || h.payment_type || h.description || '').toLowerCase();
                if (cat.includes('wake')) {
                    payHistWake += amt;
                } else {
                    lotSales += amt;
                }
            }
        });

        // Compute wake space revenue directly from wakeSpaceRental bookings price
        const rentalWake = wakeRentals
            .filter(r => (r.status || '').toLowerCase() !== 'cancelled')
            .reduce((sum, r) => sum + Number(r.totalPrice || r.price || r.amount || r.total_price || 0), 0);

        const wakeSpaceRevenue = Math.max(payHistWake, rentalWake);
        const totalRevenue = lotSales + wakeSpaceRevenue;
        const netIncome = Math.max(0, totalRevenue - expenses);

        return {
            totalRevenue,
            wakeSpaceRevenue,
            lotSalesRevenue: lotSales,
            totalExpenses: expenses,
            netIncome,
            transactionsCount: payHist.length + wakeRentals.length
        };
    }, [payHist, wakeRentals]);

    const burialStats = useMemo(() => {
        const totalBurials = burials.length;
        const activeGraves = plots.filter(p => {
            const s = (p.status || '').toLowerCase();
            return s === 'occupied' || s === 'partial';
        }).length;
        const pendingBurials = burials.filter(b => {
            const s = (b.status || '').toLowerCase();
            return s === 'pending' || s === 'scheduled';
        }).length;

        let burialRev = 0;
        payHist.forEach(h => {
            const cat = (h.category || h.payment_type || h.description || '').toLowerCase();
            if (cat.includes('burial') || cat.includes('interment')) {
                burialRev += Number(h.amount || 0);
            }
        });

        return {
            totalBurials,
            activeGraves,
            pendingBurials,
            revenue: burialRev
        };
    }, [burials, plots, payHist]);

    const occupancyStats = useMemo(() => {
        const total = plots.length;
        let avail = 0;
        let occ = 0;
        let res = 0;

        plots.forEach(p => {
            const s = (p.status || '').toLowerCase();
            if (s === 'available') avail++;
            else if (s === 'occupied' || s === 'partial') occ++;
            else if (s === 'reserved') res++;
        });

        const rate = total > 0 ? Math.round((occ / total) * 100) : 0;
        const availPct = total > 0 ? Math.round((avail / total) * 100) : 0;
        const occPct = total > 0 ? Math.round((occ / total) * 100) : 0;
        const resPct = total > 0 ? Math.round((res / total) * 100) : 0;

        return { total, avail, occ, res, rate, availPct, occPct, resPct };
    }, [plots]);

    const collectionStats = useMemo(() => {
        let fullyPaid = 0;
        let installment = 0;
        let totalOutstanding = 0;

        payments.forEach(p => {
            const s = (p.payment_status || '').toLowerCase();
            const bal = Number(p.balance || 0);
            if (s === 'paid' || bal <= 0) {
                fullyPaid++;
            } else {
                installment++;
                totalOutstanding += bal;
            }
        });

        const overdue = overdueTable.length;
        const totalRecords = payments.length || 1;
        const paidPct = Math.round((fullyPaid / totalRecords) * 100);
        const instPct = Math.round((installment / totalRecords) * 100);
        const overduePct = Math.round((overdue / totalRecords) * 100);

        return {
            fullyPaid,
            installment,
            overdue,
            totalOutstanding,
            paidPct,
            instPct,
            overduePct
        };
    }, [payments, overdueTable]);

    const renewalStats = useMemo(() => {
        const expiringThisWeek = renewalTable.filter(r => r._dl >= 0 && r._dl <= 7).length;
        const expiringThisMonth = renewalTable.filter(r => r._dl >= 0 && r._dl <= 30).length;

        const currentYM = today.slice(0, 7);
        let renewedThisMonth = 0;
        let renewalRev = 0;

        payHist.forEach(h => {
            const cat = (h.category || h.payment_type || h.description || '').toLowerCase();
            const isRenewal = cat.includes('renewal') || cat.includes('renew');
            if (isRenewal) {
                renewalRev += Number(h.amount || 0);
                const d = toDateStr(h.payment_date || h.created_at);
                if (d && d.startsWith(currentYM)) {
                    renewedThisMonth++;
                }
            }
        });

        let apt = 0, col = 0, bone = 0;
        renewalTable.forEach(r => {
            const code = String(r.lot || '').toUpperCase();
            if (code.startsWith('AP') || code.includes('APARTMENT')) apt++;
            else if (code.startsWith('CO') || code.startsWith('SN') || code.includes('COLUMBARIUM') || code.includes('NICHE')) col++;
            else if (code.startsWith('BV') || code.includes('BONE')) bone++;
            else apt++;
        });

        return {
            expiringThisWeek,
            expiringThisMonth,
            renewedThisMonth,
            renewalRevenue: renewalRev,
            apt,
            col,
            bone
        };
    }, [renewalTable, payHist, today]);

    // Modals
    const [dateRangeModal, setDateRangeModal] = useState(false);
    const [exportModal, setExportModal] = useState(false);
    
    // Forms
    const [dateFrom, setDateFrom] = useState('2026-03-01');
    const [dateTo, setDateTo] = useState('2026-03-15');
    const [exportType, setExportType] = useState('financial');
    const [exportFormat, setExportFormat] = useState('csv');

    // Pagination State
    const [pages, setPages] = useState({
        financial: 1,
        occupancy: 1,
        collections: 1,
        renewals: 1,
    });
    const ITEMS_PER_PAGE = 10;

    const handlePageChange = (tab, newPage) => {
        setPages(prev => ({ ...prev, [tab]: newPage }));
    };

    const paginate = (array, page, pageSize = ITEMS_PER_PAGE) => {
        if (!array || !array.length) return { items: [], totalPages: 0, start: 0, end: 0, total: 0, currentPage: 1 };
        const total = array.length;
        const totalPages = Math.ceil(total / pageSize);
        const validPage = Math.min(Math.max(1, page), totalPages);
        const start = (validPage - 1) * pageSize;
        const items = array.slice(start, start + pageSize);
        return {
            items,
            totalPages,
            currentPage: validPage,
            start: start + 1,
            end: Math.min(start + pageSize, total),
            total
        };
    };

    const financialPaging = paginate(financialTransactions, pages.financial);
    const occupancyPaging = paginate(occupancyTable, pages.occupancy);
    const overduePaging = paginate(overdueTable, pages.collections);
    const renewalPaging = paginate(renewalTable, pages.renewals);

    const renderPagination = (paging, tab) => {
        if (!paging.total) return null;
        return (
            <div className="report-pagination-bar">
                <span className="report-showing-text">
                    Showing <strong>{paging.start}</strong> to <strong>{paging.end}</strong> of <strong>{paging.total}</strong> records
                </span>
                {paging.totalPages > 1 && (
                    <Pagination
                        currentPage={paging.currentPage}
                        totalPages={paging.totalPages}
                        onPageChange={(page) => handlePageChange(tab, page)}
                    />
                )}
            </div>
        );
    };


    const showToast = (msg, type = 'success') => {
        setToast({ show: true, msg, type });
        setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3500);
    };

    const handleTabChange = (tab) => {
        setCurrentTab(tab);
        const labels = {
            'financial': 'Financial', 'burial': 'Burial', 'occupancy': 'Occupancy',
            'collections': 'Collections', 'renewals': 'Renewals', 'wakespace': 'Wake Space', 'inventory': 'Inventory'
        };
        showToast(`📊 Switched to ${labels[tab]} report`, 'info');
    };

    const confirmExport = () => {
        setExportModal(false);
        showToast(`⏳ Exporting ${exportType} as ${exportFormat}...`, 'info');
        
        setTimeout(() => {
            if (exportFormat === 'csv') {
                let data = [];
                if (exportType === 'financial') data = financialTransactions;
                if (exportType === 'burial') data = burialData;
                if (exportType === 'occupancy') data = occupancyTable;
                if (exportType === 'collections') data = overdueTable;
                if (exportType === 'renewals') data = renewalTable;
                
                if (data.length) {
                    downloadCSV(data, `${exportType}_report_${new Date().toISOString().slice(0,10)}.csv`);
                    showToast(`✅ ${exportType} exported successfully as CSV!`, 'success');
                } else {
                    showToast(`No data to export for ${exportType}.`, 'info');
                }
            } else if (exportFormat === 'pdf') {
                window.print();
                showToast(`✅ PDF dialog opened`, 'success');
            } else {
                showToast(`✅ ${exportType} exported successfully as ${exportFormat}!`, 'success');
            }
        }, 1500);
    };

    const formatDateShort = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Render Helpers for Charts
    const renderBar = (item, max, colorOrGradient, isPercent = false) => {
        const height = max === 0 ? 0 : (item / max) * 100;
        const bg = colorOrGradient.includes('linear') ? colorOrGradient : colorOrGradient;
        return <div className="bar" style={{height: `${height}%`, background: bg}}></div>;
    };

    return (
        <div className="reports-page">
            <Header page="reports" />
            <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`} style={{top: '80px', position: 'fixed', zIndex: 99999}}>
                <span>{toast.msg}</span>
                <button className="toast-close" onClick={() => setToast(prev => ({...prev, show: false}))}>×</button>
            </div>

            <div className="reports-container" >
                <div className="report-header">
                    <div className="report-header-left">
                        <h2><i className="fas fa-chart-pie" style={{color:'#d4af37', marginRight:'8px'}}></i>Analytics Dashboard</h2>
                    </div>
                    <div className="report-header-right">
                        <button className="btn-secondary" onClick={() => setExportModal(true)}>
                            <i className="fas fa-file-export"></i> Export
                        </button>
                        <button className="btn-primary" onClick={() => setDateRangeModal(true)}>
                            <i className="fas fa-calendar-alt"></i> Custom Range
                        </button>
                    </div>
                </div>

                <div className="report-tabs-wrapper">
                    <div className="report-tabs">
                        <button className={`report-tab ${currentTab==='financial'?'active':''}`} onClick={()=>handleTabChange('financial')}><i className="fas fa-coins"></i> Financial</button>
                        <button className={`report-tab ${currentTab==='burial'?'active':''}`} onClick={()=>handleTabChange('burial')}><i className="fas fa-cross"></i> Burial</button>
                        <button className={`report-tab ${currentTab==='occupancy'?'active':''}`} onClick={()=>handleTabChange('occupancy')}><i className="fas fa-tshirt"></i> Occupancy</button>
                        <button className={`report-tab ${currentTab==='collections'?'active':''}`} onClick={()=>handleTabChange('collections')}><i className="fas fa-coins"></i> Collections {overdueTable.length > 0 && <span className="tab-badge">{overdueTable.length}</span>}</button>
                        <button className={`report-tab ${currentTab==='renewals'?'active':''}`} onClick={()=>handleTabChange('renewals')}><i className="fas fa-sync-alt"></i> Renewals</button>
                    </div>
                </div>

                {/* ===== TAB: FINANCIAL ===== */}
                {currentTab === 'financial' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card">
                                <div className="icon gold"><i className="fas fa-coins"></i></div>
                                <div className="label">Total Revenue</div>
                                <div className="value">₱{financialStats.totalRevenue.toLocaleString()}</div>
                                <div className="change positive"><i className="fas fa-receipt"></i> {financialStats.transactionsCount} payments</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon blue"><i className="fas fa-bed"></i></div>
                                <div className="label">Wake Space Revenue</div>
                                <div className="value">₱{financialStats.wakeSpaceRevenue.toLocaleString()}</div>
                                <div className="change neutral"><i className="fas fa-home"></i> Facilities</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon red"><i className="fas fa-arrow-down"></i></div>
                                <div className="label">Total Expenses</div>
                                <div className="value">₱{financialStats.totalExpenses.toLocaleString()}</div>
                                <div className="change neutral"><i className="fas fa-wallet"></i> Operating costs</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon green"><i className="fas fa-chart-line"></i></div>
                                <div className="label">Net Income</div>
                                <div className="value">₱{financialStats.netIncome.toLocaleString()}</div>
                                <div className="change positive"><i className="fas fa-check-circle"></i> Live balance</div>
                            </div>
                        </div>

                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Revenue vs Expenses <span className="sub">This Week</span></div>
                                <div className="bar-chart">
                                    {financialData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No financial records available yet.</div>
                                    ) : (
                                        financialData.map((d, i) => {
                                            const max = Math.max(...financialData.map(v => Math.max(v.revenue, v.expenses)));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">₱{d.revenue >= 1000 ? `${Math.round(d.revenue / 1000)}k` : d.revenue}</div>
                                                    {renderBar(d.revenue, max, 'linear-gradient(180deg,#d4af37,#b8942e)')}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Revenue Breakdown</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#d4af37'}}></span><span className="label">Lot Sales</span><span className="value">₱{financialStats.lotSalesRevenue.toLocaleString()}</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#3670AF'}}></span><span className="label">Wake Space</span><span className="value">₱{financialStats.wakeSpaceRevenue.toLocaleString()}</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Expenses</span><span className="value">₱{financialStats.totalExpenses.toLocaleString()}</span></div>
                                    <div className="legend-item" style={{borderTop:'1px solid #e8edf4', paddingTop:'0.6rem', marginTop:'0.2rem'}}>
                                        <span className="color-dot" style={{background:'#27ae60'}}></span><span className="label" style={{fontWeight:600}}>Net Income</span><span className="value" style={{color:'#27ae60'}}>₱{financialStats.netIncome.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="report-table-card">
                            <div className="report-table-wrapper">
                                <table>
                                    <thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th style={{textAlign:'right'}}>Amount</th></tr></thead>
                                    <tbody>
                                        {financialTransactions.length === 0 ? (
                                            <tr><td colSpan="4" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No financial transactions recorded yet.</td></tr>
                                        ) : (
                                            financialPaging.items.map((t, i) => (
                                                <tr key={i}>
                                                    <td>{t.date}</td><td>{t.transaction}</td><td>{t.category}</td>
                                                    <td style={{textAlign:'right'}} className={`amount ${t.type}`}>{t.amount > 0 ? `₱${t.amount.toLocaleString()}` : `-₱${Math.abs(t.amount).toLocaleString()}`}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {renderPagination(financialPaging, 'financial')}
                        </div>
                    </div>
                )}

                {/* ===== TAB: BURIAL ===== */}
                {currentTab === 'burial' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card">
                                <div className="icon gold"><i className="fas fa-cross"></i></div>
                                <div className="label">Total Burials</div>
                                <div className="value">{burialStats.totalBurials}</div>
                                <div className="change positive"><i className="fas fa-history"></i> Recorded</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon blue"><i className="fas fa-tshirt"></i></div>
                                <div className="label">Active Graves</div>
                                <div className="value">{burialStats.activeGraves}</div>
                                <div className="change neutral"><i className="fas fa-layer-group"></i> Occupied plots</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon red"><i className="fas fa-clock"></i></div>
                                <div className="label">Pending Burials</div>
                                <div className="value">{burialStats.pendingBurials}</div>
                                <div className={`change ${burialStats.pendingBurials > 0 ? 'negative' : 'positive'}`}><i className="fas fa-calendar-alt"></i> Scheduled</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon green"><i className="fas fa-coins"></i></div>
                                <div className="label">Revenue from Burials</div>
                                <div className="value">₱{burialStats.revenue.toLocaleString()}</div>
                                <div className="change positive"><i className="fas fa-check-circle"></i> Service fees</div>
                            </div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Burials by Grave Type</div>
                                <div className="bar-chart">
                                    {burialData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No burial records available yet.</div>
                                    ) : (
                                        burialData.map((d, i) => {
                                            const max = Math.max(...burialData.map(v => v.value));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">{d.value}</div>
                                                    {renderBar(d.value, max, d.color)}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Burial Distribution</div>
                                <div className="legend">
                                    {burialData.length === 0 ? (
                                        <div style={{padding:'1rem', color:'#7a9fbe'}}>No burial distribution data.</div>
                                    ) : (
                                        burialData.map((d, i) => (
                                            <div className="legend-item" key={i}><span className="color-dot" style={{background: d.color}}></span><span className="label">{d.label}</span><span className="value">{d.value}</span></div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== TAB: OCCUPANCY ===== */}
                {currentTab === 'occupancy' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card">
                                <div className="icon blue"><i className="fas fa-tshirt"></i></div>
                                <div className="label">Total Lots</div>
                                <div className="value">{occupancyStats.total}</div>
                                <div className="change neutral"><i className="fas fa-layer-group"></i> Total capacity</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon green"><i className="fas fa-check-circle"></i></div>
                                <div className="label">Available</div>
                                <div className="value">{occupancyStats.avail}</div>
                                <div className="change positive"><i className="fas fa-check"></i> {occupancyStats.availPct}% vacant</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon red"><i className="fas fa-circle"></i></div>
                                <div className="label">Occupied</div>
                                <div className="value">{occupancyStats.occ}</div>
                                <div className="change neutral"><i className="fas fa-user-check"></i> {occupancyStats.occPct}% filled</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon orange"><i className="fas fa-clock"></i></div>
                                <div className="label">Reserved</div>
                                <div className="value">{occupancyStats.res}</div>
                                <div className="change neutral"><i className="fas fa-bookmark"></i> {occupancyStats.resPct}% on hold</div>
                            </div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Occupancy by Grave Type <span className="sub">Available vs Occupied</span></div>
                                <div className="bar-chart">
                                    {occupancyData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No occupancy records available yet.</div>
                                    ) : (
                                        occupancyData.map((d, i) => {
                                            const max = Math.max(...occupancyData.map(v => Math.max(v.avail, v.occ, v.res)));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">{d.occ}</div>
                                                    {renderBar(d.occ, max, '#c0392b')}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Overall Occupancy</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Available</span><span className="value">{occupancyStats.avail} ({occupancyStats.availPct}%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Occupied</span><span className="value">{occupancyStats.occ} ({occupancyStats.occPct}%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#f39c12'}}></span><span className="label">Reserved</span><span className="value">{occupancyStats.res} ({occupancyStats.resPct}%)</span></div>
                                    <div className="legend-item" style={{borderTop:'1px solid #e8edf4', paddingTop:'0.6rem', marginTop:'0.2rem'}}>
                                        <span className="color-dot" style={{background:'#d4af37'}}></span><span className="label" style={{fontWeight:600}}>Occupancy Rate</span><span className="value" style={{color:'#d4af37'}}>{occupancyStats.rate}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="report-table-card">
                            <div className="report-table-wrapper">
                                <table>
                                    <thead><tr><th>Section</th><th>Total</th><th>Available</th><th>Occupied</th><th>Reserved</th><th style={{textAlign:'right'}}>Rate</th></tr></thead>
                                    <tbody>
                                        {occupancyTable.length === 0 ? (
                                            <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No occupancy records available yet.</td></tr>
                                        ) : (
                                            occupancyPaging.items.map((t, i) => (
                                                <tr key={i}>
                                                    <td>{t.section}</td><td>{t.total}</td><td>{t.avail}</td><td>{t.occ}</td><td>{t.res}</td><td style={{textAlign:'right', fontWeight:600}}>{t.rate}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {renderPagination(occupancyPaging, 'occupancy')}
                        </div>
                    </div>
                )}

                {/* ===== TAB: COLLECTIONS ===== */}
                {currentTab === 'collections' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card">
                                <div className="icon green"><i className="fas fa-check-circle"></i></div>
                                <div className="label">Fully Paid</div>
                                <div className="value">{collectionStats.fullyPaid}</div>
                                <div className="change positive"><i className="fas fa-check"></i> {collectionStats.paidPct}% complete</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon orange"><i className="fas fa-clock"></i></div>
                                <div className="label">On Installment</div>
                                <div className="value">{collectionStats.installment}</div>
                                <div className="change neutral"><i className="fas fa-calendar-alt"></i> Active plans</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon red"><i className="fas fa-exclamation-triangle"></i></div>
                                <div className="label">Overdue</div>
                                <div className="value">{collectionStats.overdue}</div>
                                <div className={`change ${collectionStats.overdue > 0 ? 'negative' : 'positive'}`}><i className="fas fa-exclamation-circle"></i> Needs follow-up</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon purple"><i className="fas fa-coins"></i></div>
                                <div className="label">Total Outstanding</div>
                                <div className="value">₱{collectionStats.totalOutstanding.toLocaleString()}</div>
                                <div className="change neutral"><i className="fas fa-coins"></i> Uncollected</div>
                            </div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Payment Status Distribution</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Fully Paid</span><span className="value">{collectionStats.fullyPaid} ({collectionStats.paidPct}%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#f39c12'}}></span><span className="label">Installment</span><span className="value">{collectionStats.installment} ({collectionStats.instPct}%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Overdue</span><span className="value">{collectionStats.overdue} ({collectionStats.overduePct}%)</span></div>
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Overdue by Days</div>
                                <div className="bar-chart">
                                    {overdueData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No overdue records available yet.</div>
                                    ) : (
                                        overdueData.map((d, i) => {
                                            const max = Math.max(...overdueData.map(v => v.value));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">{d.value}</div>
                                                    {renderBar(d.value, max, d.color)}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="report-table-card">
                            <div className="report-table-wrapper">
                                <table>
                                    <thead><tr><th>Client</th><th>Lot</th><th>Amount Due</th><th>Overdue Since</th><th>Days</th><th>Status</th></tr></thead>
                                    <tbody>
                                        {overdueTable.length === 0 ? (
                                            <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No overdue payment records available yet.</td></tr>
                                        ) : (
                                            overduePaging.items.map((t, i) => (
                                                <tr key={i}>
                                                    <td>{t.client}</td><td>{t.lot}</td><td className="amount negative">₱{t.amount.toLocaleString()}</td><td>{t.overdueSince}</td><td>{t.days}</td>
                                                    <td><span className={`status-badge ${t.statusClass}`}>{t.status}</span></td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {renderPagination(overduePaging, 'collections')}
                        </div>
                    </div>
                )}

                {/* ===== TAB: RENEWALS ===== */}
                {currentTab === 'renewals' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card">
                                <div className="icon red"><i className="fas fa-exclamation-triangle"></i></div>
                                <div className="label">Expiring This Week</div>
                                <div className="value">{renewalStats.expiringThisWeek}</div>
                                <div className={`change ${renewalStats.expiringThisWeek > 0 ? 'negative' : 'positive'}`}><i className="fas fa-hourglass-half"></i> &le; 7 days</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon orange"><i className="fas fa-clock"></i></div>
                                <div className="label">Expiring This Month</div>
                                <div className="value">{renewalStats.expiringThisMonth}</div>
                                <div className="change neutral"><i className="fas fa-calendar"></i> &le; 30 days</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon green"><i className="fas fa-check-circle"></i></div>
                                <div className="label">Renewed This Month</div>
                                <div className="value">{renewalStats.renewedThisMonth}</div>
                                <div className="change positive"><i className="fas fa-check"></i> Processed</div>
                            </div>
                            <div className="summary-card">
                                <div className="icon gold"><i className="fas fa-coins"></i></div>
                                <div className="label">Renewal Revenue</div>
                                <div className="value">₱{renewalStats.renewalRevenue.toLocaleString()}</div>
                                <div className="change positive"><i className="fas fa-receipt"></i> Collected</div>
                            </div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Renewal Forecast <span className="sub">Next 6 Months</span></div>
                                <div className="bar-chart">
                                    {renewalData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No renewal forecast data available yet.</div>
                                    ) : (
                                        renewalData.map((d, i) => {
                                            const max = Math.max(...renewalData.map(v => v.value));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">{d.value}</div>
                                                    {renderBar(d.value, max, 'linear-gradient(180deg,#d4af37,#b8942e)')}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Renewal by Grave Type</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Apartment</span><span className="value">{renewalStats.apt}</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#3670AF'}}></span><span className="label">Columbarium</span><span className="value">{renewalStats.col}</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#7f8c8d'}}></span><span className="label">Bone Vault</span><span className="value">{renewalStats.bone}</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="report-table-card">
                            <div className="report-table-wrapper">
                                <table>
                                    <thead><tr><th>Lot</th><th>Client</th><th>Expiry Date</th><th>Days Left</th><th>Status</th></tr></thead>
                                    <tbody>
                                        {renewalTable.length === 0 ? (
                                            <tr><td colSpan="5" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No contract renewal records available yet.</td></tr>
                                        ) : (
                                            renewalPaging.items.map((t, i) => (
                                                <tr key={i}>
                                                    <td>{t.lot}</td><td>{t.client}</td><td>{t.expiry}</td><td style={{color: t.color}}>{t.days}</td>
                                                    <td><span className={`status-badge ${t.statusClass}`}>{t.status}</span></td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {renderPagination(renewalPaging, 'renewals')}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== DATE RANGE MODAL ===== */}
            {dateRangeModal && (
                <div className="modal-overlay active" onClick={() => setDateRangeModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon" style={{color:'#3670AF'}}><i className="fas fa-calendar-alt"></i></div>
                        <h3>Select Date Range</h3>
                        <p className="modal-subtitle">Choose the period for your report</p>
                        <div className="form-row">
                            <div className="form-group"><label>From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                            <div className="form-group"><label>To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setDateRangeModal(false)}>Cancel</button>
                            <button className="btn-confirm" onClick={() => { setDateRangeModal(false); showToast(`📅 Report range set: ${dateFrom} to ${dateTo}`, 'success'); }}><i className="fas fa-check"></i> Apply Range</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== EXPORT REPORT MODAL ===== */}
            {exportModal && (
                <div className="modal-overlay active" onClick={() => setExportModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon" style={{color:'#27ae60'}}><i className="fas fa-file-export"></i></div>
                        <h3>Export Report</h3>
                        <p className="modal-subtitle">Choose your export format</p>
                        <div className="form-group">
                            <label>Report Type</label>
                            <select value={exportType} onChange={e => setExportType(e.target.value)}>
                                <option value="financial">Financial Report</option>
                                <option value="burial">Burial Report</option>
                                <option value="occupancy">Occupancy Report</option>
                                <option value="collections">Collections Report</option>
                                <option value="renewals">Renewals Report</option>
                                <option value="wakespace">Wake Space Report</option>
                                <option value="inventory">Inventory Report</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Export Format</label>
                            <select value={exportFormat} onChange={e => setExportFormat(e.target.value)}>
                                <option value="pdf">PDF Document</option>
                                <option value="csv">CSV / Excel</option>
                                <option value="json">JSON Data</option>
                            </select>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setExportModal(false)}>Cancel</button>
                            <button className="btn-confirm" onClick={confirmExport}><i className="fas fa-download"></i> Export</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
