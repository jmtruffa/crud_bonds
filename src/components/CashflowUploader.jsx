import { useState, useEffect, useRef } from 'react';
import { getCashflows, updateCashflow, deleteCashflow, uploadCashflowsJson, uploadBondPdfs, listBondPdfs, deleteBondPdf } from '../api';
import { generateCashflowDates } from '../utils/dateHelpers';

export default function CashflowUploader({ bond }) {
  const [cashflows, setCashflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [editingRows, setEditingRows] = useState({});
  const [lastSeq, setLastSeq] = useState(0);
  const [lastResidual, setLastResidual] = useState(100);
  const [newCashflows, setNewCashflows] = useState([]);
  const [showPreloadMenu, setShowPreloadMenu] = useState(false);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [uploadedPdfs, setUploadedPdfs] = useState([]);
  const tableRef = useRef(null);
  const preloadRef = useRef(null);
  const pdfInputRef = useRef(null);

  async function load() {
    if (!bond) return;
    setLoading(true);
    try {
      const rows = await getCashflows(bond.id);
      setCashflows(rows);
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        setLastSeq(last.seq);
        setLastResidual(last.residual);
      } else {
        setLastSeq(0);
        setLastResidual(100);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to load cashflows');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [bond]);

  useEffect(() => {
    if (bond && bond.ticker) {
      listBondPdfs(bond.ticker).then(setUploadedPdfs).catch(() => setUploadedPdfs([]));
    }
  }, [bond]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (preloadRef.current && !preloadRef.current.contains(e.target)) {
        setShowPreloadMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handlePdfUpload() {
    if (pdfFiles.length === 0) return;
    if (pdfFiles.length > 10) {
      alert('Máximo 10 archivos PDF.');
      return;
    }
    try {
      const result = await uploadBondPdfs(bond.ticker, pdfFiles);
      setPdfFiles([]);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      setUploadedPdfs(prev => [...prev, ...result.uploaded]);
      alert(`${result.uploaded.length} PDF(s) subidos correctamente.`);
    } catch (err) {
      console.error(err);
      alert('Error al subir PDFs: ' + err.message);
    }
  }

  function handleViewPdf(url) {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    window.open(base + url, '_blank');
  }

  async function handleDeletePdf(filename) {
    if (!window.confirm(`¿Eliminar ${filename}?`)) return;
    try {
      await deleteBondPdf(bond.ticker, filename);
      setUploadedPdfs(prev => prev.filter(p => p.filename !== filename));
    } catch (err) {
      console.error(err);
      alert('Error al eliminar PDF: ' + err.message);
    }
  }

  function handlePreload(stepMonths) {
    setShowPreloadMenu(false);
    if (!bond.issue_date || !bond.maturity) {
      alert('El bono debe tener issue date y maturity definidos.');
      return;
    }
    const issueStr = typeof bond.issue_date === 'string' ? bond.issue_date.split('T')[0] : bond.issue_date;
    const maturityStr = typeof bond.maturity === 'string' ? bond.maturity.split('T')[0] : bond.maturity;
    const allDates = generateCashflowDates(issueStr, maturityStr, stepMonths);
    let dates = allDates;
    if (cashflows.length > 0) {
      const lastExistingDate = cashflows[cashflows.length - 1].date.split('T')[0];
      dates = allDates.filter(d => d > lastExistingDate);
    }
    if (dates.length === 0) {
      alert('No hay fechas nuevas para precargar. Todas las fechas ya están cubiertas por cashflows existentes.');
      return;
    }
    const baseSeq = lastSeq + newCashflows.length;
    const rows = dates.map((date, i) => ({
      tempId: `new-${Date.now()}-${i}`,
      seq: (baseSeq + i + 1).toString(),
      date,
      rate: '',
      amort: '',
      residual: lastResidual.toString(),
      amount: ''
    }));
    setNewCashflows(prev => [...prev, ...rows]);
    setShowTable(true);
  }

  const handleEditStart = (cfId) => {
    const cf = cashflows.find(c => c.id === cfId);
    if (cf) {
      setEditingRows(prev => ({
        ...prev,
        [cfId]: {
          seq: cf.seq.toString(),
          date: cf.date,
          rate: (parseFloat(cf.rate) * 100).toString(),
          amort: cf.amort.toString(),
          residual: cf.residual.toString(),
          amount: cf.amount.toString()
        }
      }));
    }
  };

  const handleEditChange = (cfId, field, value) => {
    setEditingRows(prev => {
      const newState = {
        ...prev,
        [cfId]: { ...prev[cfId], [field]: value }
      };
      if (field === 'amort') {
        const cfIndex = cashflows.findIndex(c => c.id === cfId);
        let prevResidual = 100;
        if (cfIndex > 0) {
          const prevCf = cashflows[cfIndex - 1];
          prevResidual = newState[prevCf.id]
            ? parseFloat(newState[prevCf.id].residual) || 0
            : parseFloat(prevCf.residual);
        }
        const newResidual = +(prevResidual - (parseFloat(value) || 0)).toFixed(2);
        newState[cfId] = { ...newState[cfId], residual: newResidual.toString() };
      }
      return newState;
    });
  };

  const handleEditCancel = (cfId) => {
    setEditingRows(prev => {
      const newState = { ...prev };
      delete newState[cfId];
      return newState;
    });
  };

  async function handleEditSave(cfId) {
    const editData = editingRows[cfId];
    const data = {
      seq: parseInt(editData.seq),
      date: editData.date,
      rate: parseFloat(editData.rate) / 100,
      amort: parseFloat(editData.amort),
      residual: parseFloat(editData.residual),
      amount: parseFloat(editData.amount)
    };
    try {
      await updateCashflow(bond.id, cfId, data);
      load();
      handleEditCancel(cfId);
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    }
  }

  const handleAddNewRow = () => {
    const tempId = `new-${Date.now()}`;
    const newRow = {
      tempId,
      seq: (lastSeq + newCashflows.length + 1).toString(),
      date: '',
      rate: '',
      amort: '',
      residual: lastResidual.toString(),
      amount: ''
    };
    setNewCashflows(prev => [...prev, newRow]);
    setTimeout(() => {
      const element = document.getElementById(`new-row-${tempId}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const handleNewCashflowChange = (tempId, field, value) => {
    setNewCashflows(prev => {
      const updated = prev.map(row =>
        row.tempId === tempId ? { ...row, [field]: value } : row
      );
      if (field === 'amort') {
        let currentResidual = lastResidual;
        for (let i = 0; i < updated.length; i++) {
          const amort = parseFloat(updated[i].amort) || 0;
          currentResidual = +(currentResidual - amort).toFixed(2);
          updated[i] = { ...updated[i], residual: currentResidual.toString() };
        }
      }
      return updated;
    });
  };

  async function handleSaveAll() {
    if (newCashflows.length === 0) return;
    const errors = [];
    let currentResidual = lastResidual;
    for (let i = 0; i < newCashflows.length; i++) {
      const row = newCashflows[i];
      const rowNum = i + 1;
      if (!row.date) errors.push(`Fila ${rowNum}: falta fecha`);
      if (row.rate === '' || row.rate === undefined) errors.push(`Fila ${rowNum}: falta rate`);
      if (row.amort === '' || row.amort === undefined) errors.push(`Fila ${rowNum}: falta amort`);
      if (row.amount === '' || row.amount === undefined) errors.push(`Fila ${rowNum}: falta amount`);
      const rate = parseFloat(row.rate);
      if (!isNaN(rate) && (rate < 0 || rate > 100)) {
        errors.push(`Fila ${rowNum}: rate debe estar entre 0 y 100`);
      }
      const amort = parseFloat(row.amort) || 0;
      currentResidual = +(currentResidual - amort).toFixed(2);
      if (currentResidual < 0) {
        errors.push(`Fila ${rowNum}: residual sería negativo (${currentResidual})`);
      }
      if (i > 0 && row.date && newCashflows[i - 1].date && row.date <= newCashflows[i - 1].date) {
        errors.push(`Fila ${rowNum}: fecha debe ser posterior a la fila anterior`);
      }
    }
    if (cashflows.length > 0 && newCashflows[0].date) {
      const lastExistingDate = cashflows[cashflows.length - 1].date.split('T')[0];
      if (newCashflows[0].date <= lastExistingDate) {
        errors.push(`La primera fecha debe ser posterior al último cashflow existente (${lastExistingDate})`);
      }
    }
    if (errors.length > 0) {
      alert('Errores de validación:\n' + errors.join('\n'));
      return;
    }
    const payload = newCashflows.map(row => ({
      date: row.date,
      rate: parseFloat(row.rate) / 100,
      amort: parseFloat(row.amort),
      amount: parseFloat(row.amount)
    }));
    try {
      await uploadCashflowsJson(bond.id, payload);
      setNewCashflows([]);
      await load();
    } catch (err) {
      console.error(err);
      alert('Error al guardar: ' + err.message);
    }
  }

  const handleNewCashflowCancel = (tempId) => {
    setNewCashflows(prev => prev.filter(row => row.tempId !== tempId));
  };

  async function handleDelete(cfId) {
    if (!window.confirm('Delete this cashflow?')) return;
    try {
      await deleteCashflow(bond.id, cfId);
      load();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Delete failed: ' + (err.error || err.message || 'Unknown error'));
    }
  }

  if (!bond) return null;

  return (
    <div className="cashflow-container">
      <h4>Cashflows Management</h4>

      <div className="cashflow-buttons">
        <button
          className="btn"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? '▼ Hide' : '▶ Show'} Cashflows Table ({cashflows.length})
        </button>
        <div className="preload-dropdown" ref={preloadRef}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowPreloadMenu(!showPreloadMenu)}
          >
            📅 Precargar formato ▾
          </button>
          {showPreloadMenu && (
            <div className="preload-menu">
              <button onClick={() => handlePreload(1)}>Mensual</button>
              <button onClick={() => handlePreload(3)}>Trimestral</button>
              <button onClick={() => handlePreload(6)}>Semestral</button>
              <button onClick={() => handlePreload(12)}>Anual</button>
            </div>
          )}
        </div>
      </div>

      {/* PDF management */}
      <div className="pdf-section">
        <div className="pdf-upload-row">
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={(e) => setPdfFiles(Array.from(e.target.files))}
            className="pdf-input"
          />
          <button
            className="btn btn-secondary"
            onClick={handlePdfUpload}
            disabled={pdfFiles.length === 0}
          >
            📄 Subir PDFs
          </button>
        </div>
        {uploadedPdfs.length > 0 && (
          <div className="pdf-list">
            <span className="pdf-list-label">PDFs subidos:</span>
            {uploadedPdfs.map((p, i) => (
              <span key={i} className="pdf-item">
                <button
                  className="btn btn-sm btn-pdf"
                  onClick={() => handleViewPdf(p.url || p.path)}
                  title="Abrir PDF en nueva pestaña"
                >
                  📎 {p.filename}
                </button>
                <button
                  className="btn btn-sm btn-danger pdf-delete-btn"
                  onClick={() => handleDeletePdf(p.filename)}
                  title="Eliminar PDF"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {showTable && (
        loading ? (
          <div className="loading">Loading cashflows...</div>
        ) : (
          <div className="cashflow-table-wrapper">
            {cashflows.length === 0 && <p style={{ marginBottom: '1rem', color: '#999' }}>No cashflows yet.</p>}
            <table className="table editable-table" ref={tableRef}>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Date</th>
                  <th>Rate (%)</th>
                  <th>Amort</th>
                  <th>Residual</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cashflows.map(c => {
                  const isEditing = editingRows[c.id];
                  const rowData = isEditing || {};
                  return (
                    <tr key={c.id} className={isEditing ? 'editing-row' : ''}>
                      <td>
                        <input type="number" value={isEditing ? rowData.seq : c.seq}
                          onChange={(e) => handleEditChange(c.id, 'seq', e.target.value)}
                          className="edit-input" readOnly={!isEditing} />
                      </td>
                      <td>
                        <input type="date"
                          value={isEditing ? (typeof rowData.date === 'string' ? rowData.date.split('T')[0] : rowData.date) : (typeof c.date === 'string' ? c.date.split('T')[0] : c.date)}
                          onChange={(e) => handleEditChange(c.id, 'date', e.target.value)}
                          className="edit-input" readOnly={!isEditing} required autoFocus />
                      </td>
                      <td>
                        <input type="number" step="0.01"
                          value={isEditing ? rowData.rate : (parseFloat(c.rate) * 100).toFixed(2)}
                          onChange={(e) => handleEditChange(c.id, 'rate', e.target.value)}
                          className="edit-input" readOnly={!isEditing} />
                      </td>
                      <td>
                        <input type="number" step="0.01"
                          value={isEditing ? rowData.amort : parseFloat(c.amort).toFixed(2)}
                          onChange={(e) => handleEditChange(c.id, 'amort', e.target.value)}
                          className="edit-input" readOnly={!isEditing} />
                      </td>
                      <td>
                        <input type="number" step="0.01"
                          value={isEditing ? rowData.residual : parseFloat(c.residual).toFixed(2)}
                          readOnly className="edit-input" />
                      </td>
                      <td>
                        <input type="number" step="0.01"
                          value={isEditing ? rowData.amount : parseFloat(c.amount).toFixed(2)}
                          onChange={(e) => handleEditChange(c.id, 'amount', e.target.value)}
                          className="edit-input" readOnly={!isEditing} />
                      </td>
                      <td className="table-actions">
                        {isEditing ? (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleEditSave(c.id)}>Save</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => handleEditCancel(c.id)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm btn-secondary" onClick={() => handleEditStart(c.id)}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {newCashflows.map(newRow => (
                  <tr key={newRow.tempId} id={`new-row-${newRow.tempId}`} className="editing-row">
                    <td><input type="number" value={newRow.seq} className="edit-input" readOnly /></td>
                    <td>
                      <input type="date" value={newRow.date}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'date', e.target.value)}
                        className="edit-input" />
                    </td>
                    <td>
                      <input type="number" step="0.01" value={newRow.rate}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'rate', e.target.value)}
                        className="edit-input" />
                    </td>
                    <td>
                      <input type="number" step="0.01" value={newRow.amort}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'amort', e.target.value)}
                        className="edit-input" />
                    </td>
                    <td><input type="number" step="0.01" value={newRow.residual} className="edit-input" readOnly /></td>
                    <td>
                      <input type="number" step="0.01" value={newRow.amount}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'amount', e.target.value)}
                        className="edit-input" />
                    </td>
                    <td className="table-actions">
                      <button className="btn btn-sm btn-danger" onClick={() => handleNewCashflowCancel(newRow.tempId)} title="Quitar fila">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {newCashflows.length > 0 && (
              <div className="save-all-bar">
                <button className="btn btn-success" onClick={handleSaveAll}>
                  💾 Guardar Todo ({newCashflows.length} cashflows)
                </button>
                <button className="btn btn-secondary" onClick={() => setNewCashflows([])}>
                  Cancelar Todo
                </button>
              </div>
            )}
            <div className="cashflow-table-footer">
              <button className="btn btn-secondary" onClick={handleAddNewRow} disabled={lastResidual <= 0}>
                ➕ Add New Cashflow
              </button>
              {lastResidual <= 0 && (
                <span className="residual-warning">Residual is 0. No more cashflows can be added.</span>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
