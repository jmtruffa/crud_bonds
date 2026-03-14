import { useState } from 'react';
import { extractFromPdfs, extractFromPdfsDebug, createBondWithCashflows, uploadBondPdfs } from '../api';

export default function CreateBondModal({ indexOptions, conventionOptions, onSuccess, onClose }) {
  const [step, setStep] = useState('upload');
  const [pdfFiles, setPdfFiles] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [bondForm, setBondForm] = useState({
    ticker: '',
    issue_date: '',
    maturity: '',
    coupon: 0,
    index_code: '',
    offset_days: 0,
    day_count_conv_id: '',
  });
  const [editedCashflows, setEditedCashflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugOutput, setDebugOutput] = useState(null);

  async function handleExtract() {
    if (pdfFiles.length === 0) {
      setError('Seleccioná al menos un archivo PDF.');
      return;
    }
    setError('');
    setDebugOutput(null);
    setLoading(true);
    try {
      const result = await extractFromPdfs(pdfFiles);
      setAiResult(result);
      setBondForm(prev => ({
        ...prev,
        issue_date: result.principal?.issue_date || '',
        maturity: result.principal?.maturity_date || '',
      }));
      const withSeq = result.cashflows.map((cf, i) => ({ ...cf, seq: i + 1 }));
      setEditedCashflows(recalcResiduals(withSeq));
      setStep('review');
    } catch (e) {
      setError('Error extrayendo cashflows: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDebug() {
    if (pdfFiles.length === 0) {
      setError('Seleccioná al menos un archivo PDF.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await extractFromPdfsDebug(pdfFiles);
      setDebugOutput(result);
    } catch (e) {
      setError('Error en debug: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function recalcResiduals(rows) {
    let residual = 100;
    return rows.map(r => {
      residual = +(residual - (parseFloat(r.amort) || 0)).toFixed(2);
      return { ...r, residual };
    });
  }

  function handleCfChange(idx, field, value) {
    setEditedCashflows(prev => {
      const updated = prev.map((r, i) => i === idx ? { ...r, [field]: value } : r);
      if (field === 'amort') return recalcResiduals(updated);
      return updated;
    });
  }

  function handleBondField(field, value) {
    setBondForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    if (!bondForm.ticker || !bondForm.issue_date || !bondForm.maturity || !bondForm.day_count_conv_id) {
      setError('Completá todos los campos requeridos: ticker, fechas y convención de días.');
      return;
    }
    if (bondForm.issue_date >= bondForm.maturity) {
      setError('La fecha de vencimiento debe ser posterior a la fecha de emisión.');
      return;
    }
    if (editedCashflows.length === 0) {
      setError('No hay cashflows para guardar.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const bond = {
        ...bondForm,
        coupon: Number(bondForm.coupon),
        offset_days: Number(bondForm.offset_days),
      };
      const cashflows = editedCashflows.map(({ date, rate, amort, amount }) => ({
        date,
        rate: parseFloat(rate) || 0,
        amort: parseFloat(amort) || 0,
        amount: parseFloat(amount) || 0,
      }));

      await createBondWithCashflows(bond, cashflows);

      try {
        await uploadBondPdfs(bond.ticker, pdfFiles);
      } catch (pdfErr) {
        console.warn('PDF upload after bond creation failed:', pdfErr.message);
      }

      onSuccess();
    } catch (e) {
      setError('Error creando bono: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2>Crear Bono desde PDF</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={loading}>×</button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        {step === 'upload' && (
          <div className="modal-body">
            <p>Subí los PDFs del prospecto. La IA extraerá el cronograma de pagos, la fecha de emisión y el vencimiento.</p>
            <div className="modal-form-field">
              <label>Archivos PDF (máx. 10)</label>
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={e => { setPdfFiles(Array.from(e.target.files)); setDebugOutput(null); }}
              />
              {pdfFiles.length > 0 && (
                <span className="pdf-count">{pdfFiles.length} archivo(s) seleccionado(s)</span>
              )}
            </div>

            {debugOutput && (
              <div className="modal-debug">
                <div className="modal-debug-header">
                  <strong>Debug — input a la IA</strong>
                  <span>{debugOutput.pdfFiles?.map(p => `${p.filename} (${p.chars} chars)`).join(', ')}</span>
                  <span>Total: {debugOutput.totalChars} chars · ~{debugOutput.estimatedTokens} tokens</span>
                </div>
                <div className="modal-debug-section">
                  <strong>System prompt:</strong>
                  <textarea readOnly value={debugOutput.systemPrompt} rows={6} />
                </div>
                <div className="modal-debug-section">
                  <strong>User message (texto PDFs):</strong>
                  <textarea readOnly value={debugOutput.userMessage} rows={12} />
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleDebug} disabled={loading || pdfFiles.length === 0}>
                {loading ? 'Cargando…' : 'Debug (ver input IA)'}
              </button>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
              <button className="btn btn-success" onClick={handleExtract} disabled={loading || pdfFiles.length === 0}>
                {loading ? 'Extrayendo…' : 'Extraer con IA'}
              </button>
            </div>
          </div>
        )}

        {step === 'review' && aiResult && (
          <div className="modal-body">
            {aiResult.validation?.warnings?.length > 0 && (
              <div className="modal-warnings">
                {aiResult.validation.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {aiResult.validation?.errors?.length > 0 && (
              <div className="modal-errors-list">
                {aiResult.validation.errors.map((e, i) => <div key={i}>✗ {e}</div>)}
              </div>
            )}

            <h3>Datos del Bono</h3>
            <div className="modal-form-grid">
              <div className="modal-form-field">
                <label>Ticker *</label>
                <input
                  className="edit-input"
                  value={bondForm.ticker}
                  onChange={e => handleBondField('ticker', e.target.value.toUpperCase())}
                  placeholder="Ej: AL30"
                />
              </div>
              <div className="modal-form-field">
                <label>Fecha Emisión *</label>
                <input
                  type="date"
                  className="edit-input"
                  value={bondForm.issue_date}
                  onChange={e => handleBondField('issue_date', e.target.value)}
                />
              </div>
              <div className="modal-form-field">
                <label>Vencimiento *</label>
                <input
                  type="date"
                  className="edit-input"
                  value={bondForm.maturity}
                  onChange={e => handleBondField('maturity', e.target.value)}
                />
              </div>
              <div className="modal-form-field">
                <label>Cupón</label>
                <input
                  type="number"
                  className="edit-input"
                  value={bondForm.coupon}
                  onChange={e => handleBondField('coupon', e.target.value)}
                  step="0.00001"
                />
              </div>
              <div className="modal-form-field">
                <label>Índice</label>
                <select
                  className="edit-input"
                  value={bondForm.index_code}
                  onChange={e => handleBondField('index_code', e.target.value)}
                >
                  <option value="">— ninguno —</option>
                  {indexOptions.map(opt => {
                    const val = typeof opt === 'string' ? opt : (opt.code ?? '');
                    return <option key={val} value={val}>{val}</option>;
                  })}
                </select>
              </div>
              <div className="modal-form-field">
                <label>Convención días *</label>
                <select
                  className="edit-input"
                  value={bondForm.day_count_conv_id}
                  onChange={e => handleBondField('day_count_conv_id', e.target.value)}
                >
                  <option value="">— seleccionar —</option>
                  {conventionOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.code}</option>
                  ))}
                </select>
              </div>
              <div className="modal-form-field">
                <label>Offset días</label>
                <input
                  type="number"
                  className="edit-input"
                  value={bondForm.offset_days}
                  onChange={e => handleBondField('offset_days', e.target.value)}
                />
              </div>
            </div>

            <h3>Cashflows ({editedCashflows.length} filas · amort total: {editedCashflows.reduce((s, r) => +(s + (parseFloat(r.amort) || 0)).toFixed(2), 0)})</h3>
            <div className="modal-cf-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th>Tasa</th>
                    <th>Amort</th>
                    <th>Residual</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {editedCashflows.map((cf, i) => (
                    <tr key={i}>
                      <td>{cf.seq}</td>
                      <td>
                        <input
                          type="date"
                          className="edit-input edit-input-sm"
                          value={cf.date}
                          onChange={e => handleCfChange(i, 'date', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="edit-input edit-input-sm"
                          value={cf.rate}
                          onChange={e => handleCfChange(i, 'rate', e.target.value)}
                          step="0.0001"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="edit-input edit-input-sm"
                          value={cf.amort}
                          onChange={e => handleCfChange(i, 'amort', e.target.value)}
                          step="0.01"
                        />
                      </td>
                      <td style={{ color: cf.residual < 0 ? 'red' : 'inherit' }}>{cf.residual.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          className="edit-input edit-input-sm"
                          value={cf.amount}
                          onChange={e => handleCfChange(i, 'amount', e.target.value)}
                          step="0.01"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setStep('upload')} disabled={loading}>← Volver</button>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Guardando…' : 'Crear Bono y Guardar Cashflows'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
