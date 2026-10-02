import React, { useState, useEffect } from 'react';
import './AdminReports.css';
import Header from '../../../components/Header/Header';

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

// Mock Data (Empty for backend integration)
const financialData = [];
const financialTransactions = [];
const burialData = [];
const occupancyData = [];
const occupancyTable = [];
const overdueData = [];
const overdueTable = [];
const renewalData = [];
const renewalTable = [];
const wakeData = [];
const wakeTable = [];
const wakeWeekly = [];
const inventoryData = [];
const inventoryTable = [];

export default function AdminReports() {
    const [currentTab, setCurrentTab] = useState('financial');
    const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });

    // Modals
    const [dateRangeModal, setDateRangeModal] = useState(false);
    const [exportModal, setExportModal] = useState(false);
    
    // Forms
    const [dateFrom, setDateFrom] = useState('2026-03-01');
    const [dateTo, setDateTo] = useState('2026-03-15');
    const [exportType, setExportType] = useState('financial');
    const [exportFormat, setExportFormat] = useState('csv');

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
                if (exportType === 'wakespace') data = wakeTable;
                if (exportType === 'inventory') data = inventoryTable;
                
                downloadCSV(data, `${exportType}_report_${new Date().toISOString().slice(0,10)}.csv`);
                showToast(`✅ ${exportType} exported successfully as CSV!`, 'success');
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
                        <button className={`report-tab ${currentTab==='wakespace'?'active':''}`} onClick={()=>handleTabChange('wakespace')}><i className="fas fa-bed"></i> Wake Space</button>
                        <button className={`report-tab ${currentTab==='inventory'?'active':''}`} onClick={()=>handleTabChange('inventory')}><i className="fas fa-boxes"></i> Inventory</button>
                    </div>
                </div>

                {/* ===== TAB: FINANCIAL ===== */}
                {currentTab === 'financial' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card"><div className="icon gold"><i className="fas fa-coins"></i></div><div className="label">Total Revenue</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon blue"><i className="fas fa-bed"></i></div><div className="label">Wake Space Revenue</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon red"><i className="fas fa-arrow-down"></i></div><div className="label">Total Expenses</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon green"><i className="fas fa-chart-line"></i></div><div className="label">Net Income</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
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
                                                    <div className="bar-value">₱{d.revenue}K</div>
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
                                    <div className="legend-item"><span className="color-dot" style={{background:'#d4af37'}}></span><span className="label">Lot Sales</span><span className="value">₱0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#3670AF'}}></span><span className="label">Wake Space</span><span className="value">₱0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Expenses</span><span className="value">₱0</span></div>
                                    <div className="legend-item" style={{borderTop:'1px solid #e8edf4', paddingTop:'0.6rem', marginTop:'0.2rem'}}>
                                        <span className="color-dot" style={{background:'#27ae60'}}></span><span className="label" style={{fontWeight:600}}>Net Income</span><span className="value" style={{color:'#27ae60'}}>₱0</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="report-table-wrapper">
                            <table>
                                <thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th style={{textAlign:'right'}}>Amount</th></tr></thead>
                                <tbody>
                                    {financialTransactions.length === 0 ? (
                                        <tr><td colSpan="4" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No financial transactions recorded yet.</td></tr>
                                    ) : (
                                        financialTransactions.map((t, i) => (
                                            <tr key={i}>
                                                <td>{t.date}</td><td>{t.transaction}</td><td>{t.category}</td>
                                                <td style={{textAlign:'right'}} className={`amount ${t.type}`}>{t.amount > 0 ? `₱${t.amount.toLocaleString()}` : `-₱${Math.abs(t.amount).toLocaleString()}`}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===== TAB: BURIAL ===== */}
                {currentTab === 'burial' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card"><div className="icon gold"><i className="fas fa-cross"></i></div><div className="label">Total Burials</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon blue"><i className="fas fa-tshirt"></i></div><div className="label">Active Graves</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon red"><i className="fas fa-clock"></i></div><div className="label">Pending Burials</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon green"><i className="fas fa-coins"></i></div><div className="label">Revenue from Burials</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Burials by Type <span className="sub">This Month</span></div>
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
                            <div className="summary-card"><div className="icon blue"><i className="fas fa-tshirt"></i></div><div className="label">Total Lots</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon green"><i className="fas fa-check-circle"></i></div><div className="label">Available</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon red"><i className="fas fa-circle"></i></div><div className="label">Occupied</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon orange"><i className="fas fa-clock"></i></div><div className="label">Reserved</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
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
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Available</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Occupied</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#f39c12'}}></span><span className="label">Reserved</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item" style={{borderTop:'1px solid #e8edf4', paddingTop:'0.6rem', marginTop:'0.2rem'}}>
                                        <span className="color-dot" style={{background:'#d4af37'}}></span><span className="label" style={{fontWeight:600}}>Occupancy Rate</span><span className="value" style={{color:'#d4af37'}}>0%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="report-table-wrapper">
                            <table>
                                <thead><tr><th>Section</th><th>Total</th><th>Available</th><th>Occupied</th><th>Reserved</th><th style={{textAlign:'right'}}>Rate</th></tr></thead>
                                <tbody>
                                    {occupancyTable.length === 0 ? (
                                        <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No occupancy records available yet.</td></tr>
                                    ) : (
                                        occupancyTable.map((t, i) => (
                                            <tr key={i}>
                                                <td>{t.section}</td><td>{t.total}</td><td>{t.avail}</td><td>{t.occ}</td><td>{t.res}</td><td style={{textAlign:'right', fontWeight:600}}>{t.rate}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===== TAB: COLLECTIONS ===== */}
                {currentTab === 'collections' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card"><div className="icon green"><i className="fas fa-check-circle"></i></div><div className="label">Fully Paid</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon orange"><i className="fas fa-clock"></i></div><div className="label">On Installment</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon red"><i className="fas fa-exclamation-triangle"></i></div><div className="label">Overdue</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon purple"><i className="fas fa-coins"></i></div><div className="label">Total Outstanding</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Payment Status Distribution</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Fully Paid</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#f39c12'}}></span><span className="label">Installment</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Overdue</span><span className="value">0 (0%)</span></div>
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
                        <div className="report-table-wrapper">
                            <table>
                                <thead><tr><th>Client</th><th>Lot</th><th>Amount Due</th><th>Overdue Since</th><th>Days</th><th>Status</th></tr></thead>
                                <tbody>
                                    {overdueTable.length === 0 ? (
                                        <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No overdue payment records available yet.</td></tr>
                                    ) : (
                                        overdueTable.map((t, i) => (
                                            <tr key={i}>
                                                <td>{t.client}</td><td>{t.lot}</td><td className="amount negative">₱{t.amount.toLocaleString()}</td><td>{t.overdueSince}</td><td>{t.days}</td>
                                                <td><span className={`status-badge ${t.statusClass}`}>{t.status}</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===== TAB: RENEWALS ===== */}
                {currentTab === 'renewals' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card"><div className="icon red"><i className="fas fa-exclamation-triangle"></i></div><div className="label">Expiring This Week</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon orange"><i className="fas fa-clock"></i></div><div className="label">Expiring This Month</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon green"><i className="fas fa-check-circle"></i></div><div className="label">Renewed This Month</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon gold"><i className="fas fa-coins"></i></div><div className="label">Renewal Revenue</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
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
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Apartment</span><span className="value">0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#3670AF'}}></span><span className="label">Columbarium</span><span className="value">0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#7f8c8d'}}></span><span className="label">Bone Vault</span><span className="value">0</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="report-table-wrapper">
                            <table>
                                <thead><tr><th>Lot</th><th>Client</th><th>Expiry Date</th><th>Days Left</th><th>Status</th></tr></thead>
                                <tbody>
                                    {renewalTable.length === 0 ? (
                                        <tr><td colSpan="5" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No contract renewal records available yet.</td></tr>
                                    ) : (
                                        renewalTable.map((t, i) => (
                                            <tr key={i}>
                                                <td>{t.lot}</td><td>{t.client}</td><td>{t.expiry}</td><td style={{color: t.color}}>{t.days}</td>
                                                <td><span className={`status-badge ${t.statusClass}`}>{t.status}</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===== TAB: WAKE SPACE ===== */}
                {currentTab === 'wakespace' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card"><div className="icon gold"><i className="fas fa-calendar-check"></i></div><div className="label">Total Bookings</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon blue"><i className="fas fa-bed"></i></div><div className="label">Utilization Rate</div><div className="value">0%</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon red"><i className="fas fa-clock"></i></div><div className="label">Pending Bookings</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon green"><i className="fas fa-coins"></i></div><div className="label">Revenue from Wake</div><div className="value">₱0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                        </div>

                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Monthly Bookings <span className="sub">Last 6 Months</span></div>
                                <div className="bar-chart">
                                    {wakeData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No wake space booking data available yet.</div>
                                    ) : (
                                        wakeData.map((d, i) => {
                                            const max = Math.max(...wakeData.map(v => v.value));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">{d.value}</div>
                                                    {renderBar(d.value, max, 'linear-gradient(180deg,#3670AF,#2c5f82)')}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Booking Status Distribution</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Confirmed</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#f39c12'}}></span><span className="label">Pending</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#7f8c8d'}}></span><span className="label">Completed</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#c0392b'}}></span><span className="label">Cancelled</span><span className="value">0 (0%)</span></div>
                                    <div className="legend-item" style={{borderTop:'1px solid #e8edf4', paddingTop:'0.6rem', marginTop:'0.2rem'}}>
                                        <span className="color-dot" style={{background:'#d4af37'}}></span><span className="label" style={{fontWeight:600}}>Booking Rate</span><span className="value" style={{color:'#d4af37'}}>0%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="report-table-wrapper">
                            <table>
                                <thead><tr><th>Booking ID</th><th>Client</th><th>Deceased</th><th>Dates</th><th>Duration</th><th>Status</th></tr></thead>
                                <tbody>
                                    {wakeTable.length === 0 ? (
                                        <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No wake space bookings recorded yet.</td></tr>
                                    ) : (
                                        wakeTable.map((t, i) => {
                                            const diff = Math.ceil(Math.abs(new Date(t.end) - new Date(t.start)) / (1000 * 60 * 60 * 24));
                                            return (
                                                <tr key={i}>
                                                    <td><strong>{t.id}</strong></td><td>{t.client}</td><td>{t.deceased}</td>
                                                    <td>{formatDateShort(t.start)} - {formatDateShort(t.end)}</td><td>{diff} day{diff > 1 ? 's' : ''}</td>
                                                    <td><span className={`status-badge ${t.statusClass}`}>{t.status}</span></td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', marginTop:'1.5rem'}}>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-calendar-week"></i> This Week's Utilization</div>
                                <div className="bar-chart">
                                    {wakeWeekly.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No utilization records for this week.</div>
                                    ) : (
                                        wakeWeekly.map((d, i) => (
                                            <div className="bar-item" key={i}>
                                                <div className="bar-value">{d.booked}/{d.total}</div>
                                                <div className="bar" style={{height:`${(d.booked/1)*100}%`, background: d.booked > 0 ? '#27ae60' : '#e8edf4', border: d.booked === 0 ? '1px solid #dce3ec' : 'none'}}></div>
                                                <div className="bar-label">{d.label}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-info-circle"></i> Space Status</div>
                                <div style={{display:'flex', flexDirection:'column', gap:'0.5rem', padding:'0.5rem 0'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid #f0f2f5'}}>
                                        <span style={{color:'#7a9fbe'}}>Status</span><span style={{fontWeight:600, color:'#27ae60'}}>Available</span>
                                    </div>
                                    <div style={{display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid #f0f2f5'}}>
                                        <span style={{color:'#7a9fbe'}}>Today's Bookings</span><span style={{fontWeight:600}}>0</span>
                                    </div>
                                    <div style={{display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid #f0f2f5'}}>
                                        <span style={{color:'#7a9fbe'}}>Next Available Date</span><span style={{fontWeight:600, color:'#27ae60'}}>—</span>
                                    </div>
                                    <div style={{display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid #f0f2f5'}}>
                                        <span style={{color:'#7a9fbe'}}>Average Duration</span><span style={{fontWeight:600}}>—</span>
                                    </div>
                                    <div style={{display:'flex', justifyContent:'space-between', padding:'0.3rem 0'}}>
                                        <span style={{color:'#7a9fbe'}}>Total Booked Days (This Month)</span><span style={{fontWeight:600, color:'#d4af37'}}>0 days</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== TAB: INVENTORY ===== */}
                {currentTab === 'inventory' && (
                    <div className="tab-content active">
                        <div className="summary-grid">
                            <div className="summary-card"><div className="icon blue"><i className="fas fa-tshirt"></i></div><div className="label">Total Lots</div><div className="value">0</div><div className="change neutral"><i className="fas fa-minus"></i> No data yet</div></div>
                            <div className="summary-card"><div className="icon gold"><i className="fas fa-crown"></i></div><div className="label">Most Available</div><div className="value">—</div><div className="change neutral">0 slots</div></div>
                            <div className="summary-card"><div className="icon red"><i className="fas fa-circle"></i></div><div className="label">Most Occupied</div><div className="value">—</div><div className="change neutral">0 occupied</div></div>
                            <div className="summary-card"><div className="icon orange"><i className="fas fa-clock"></i></div><div className="label">Sold Out Types</div><div className="value">0</div><div className="change neutral">None</div></div>
                        </div>
                        <div className="chart-section">
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-bar"></i> Inventory by Grave Type</div>
                                <div className="bar-chart">
                                    {inventoryData.length === 0 ? (
                                        <div style={{padding:'2.5rem 1rem', textAlign:'center', color:'#7a9fbe', width:'100%'}}>No inventory records available yet.</div>
                                    ) : (
                                        inventoryData.map((d, i) => {
                                            const max = Math.max(...inventoryData.map(v => Math.max(v.total, v.avail)));
                                            return (
                                                <div className="bar-item" key={i}>
                                                    <div className="bar-value">{d.total}</div>
                                                    {renderBar(d.total, max, 'linear-gradient(180deg,#5d6d7e,#aab7b8)')}
                                                    <div className="bar-label">{d.label}</div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="chart-box">
                                <div className="chart-title"><i className="fas fa-chart-pie"></i> Distribution</div>
                                <div className="legend">
                                    <div className="legend-item"><span className="color-dot" style={{background:'#d4af37'}}></span><span className="label">Single Niche</span><span className="value">0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#3670AF'}}></span><span className="label">Mausoleum</span><span className="value">0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#27ae60'}}></span><span className="label">Columbarium</span><span className="value">0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#8e44ad'}}></span><span className="label">Apartment</span><span className="value">0</span></div>
                                    <div className="legend-item"><span className="color-dot" style={{background:'#7f8c8d'}}></span><span className="label">Bone Vault</span><span className="value">0</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="report-table-wrapper">
                            <table>
                                <thead><tr><th>Grave Type</th><th>Total</th><th>Available</th><th>Occupied</th><th>Reserved</th><th style={{textAlign:'right'}}>Rate</th></tr></thead>
                                <tbody>
                                    {inventoryTable.length === 0 ? (
                                        <tr><td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#7a9fbe'}}>No inventory records available yet.</td></tr>
                                    ) : (
                                        <>
                                            {inventoryTable.map((t, i) => (
                                                <tr key={i}>
                                                    <td>{t.type}</td><td>{t.total}</td><td>{t.avail}</td><td>{t.occ}</td><td>{t.res}</td><td style={{textAlign:'right', fontWeight:600}}>{t.rate}</td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td style={{fontWeight:600}}>Total</td><td style={{fontWeight:600}}>0</td>
                                                <td style={{fontWeight:600, color:'#27ae60'}}>0</td>
                                                <td style={{fontWeight:600, color:'#c0392b'}}>0</td>
                                                <td style={{fontWeight:600, color:'#f39c12'}}>0</td>
                                                <td style={{textAlign:'right', fontWeight:600}}>0%</td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="quick-actions">
                    <button className="quick-action-btn" onClick={() => showToast('📊 Generating full report...', 'info')}><i className="fas fa-file-invoice"></i> Generate Full Report</button>
                    <button className="quick-action-btn" onClick={() => setExportModal(true)}><i className="fas fa-file-export"></i> Export Data</button>
                    <button className="quick-action-btn" onClick={() => window.print()}><i className="fas fa-print"></i> Print Report</button>
                    <button className="quick-action-btn" onClick={() => showToast('🔄 Refreshing data...', 'info')}><i className="fas fa-sync-alt"></i> Refresh Data</button>
                </div>
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
