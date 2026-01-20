import { useState, useEffect } from 'react';
import { getIndexes, getDayCountConventions } from '../api';

export default function BondForm({ initial = {}, onSave, onCancel, isClone = false }) {
  // Inicializar con defaults para evitar uncontrolled -> controlled warnings
  const [form, setForm] = useState({
    id: '',
    ticker: '',
    issue_date: '',
    maturity: '',
    coupon: 0,
    index_code: '',
    offset_days: 0,
    day_count_conv_id: ''
  });
  const [indexOptions, setIndexOptions] = useState([]);
  const [conventionOptions, setConventionOptions] = useState([]);

  // Helper para normalizar fechas (string ISO o Date)
  useEffect(() => {
    const dateToString = (date) => {
      if (!date) return '';
      if (typeof date === 'string') return date.split('T')[0];
      if (date instanceof Date && !isNaN(date)) return date.toISOString().split('T')[0];
      return '';
    };

    setForm({
      id: isClone ? '' : (initial.id || ''),
      ticker: isClone ? `${initial.ticker || ''}_COPY` : (initial.ticker || ''),
      issue_date: dateToString(initial.issue_date),
      maturity: dateToString(initial.maturity),
      coupon: initial.coupon ?? 0,
      index_code: initial.index_code ?? '',
      offset_days: initial.offset_days ?? 0,
      day_count_conv_id: initial.day_count_conv_id ?? ''
    });
  }, [initial, isClone]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [indexes, conventions] = await Promise.all([getIndexes(), getDayCountConventions()]);
        setIndexOptions(indexes || []);
        setConventionOptions(conventions || []);
      } catch (e) {
        console.error('Failed to load options', e);
      }
    }
    loadOptions();
  }, []);

  function change(e) {
    const { name, value, type } = e.target;
    // mantener todo como strings en el form — en onSave ya convertimos los números
    setForm(f => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (form.issue_date && form.maturity && form.issue_date >= form.maturity) {
      alert('Maturity date must be after Issue date');
      return;
    }
    onSave({
      ...form,
      coupon: Number(form.coupon),
      offset_days: Number(form.offset_days)
    });
  }

  // Helper para renderizar opciones de índice (puede venir string o object)
  function renderIndexOption(opt) {
    if (!opt && opt !== '') return null;
    if (typeof opt === 'string') return { value: opt, label: opt };
    // si es objeto, intentar usar code o name
    return { value: opt.code ?? opt.name ?? '', label: opt.code ?? opt.name ?? String(opt) };
  }

  return (
    <div>
      <h2>{isClone ? 'Clone Bond' : (form.id ? 'Edit Bond' : 'New Bond')}</h2>
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Ticker</label>
          <input name="ticker" value={form.ticker} onChange={change} required autoFocus />
        </div>
        <div className="form-group">
          <label>Issue Date</label>
          <input name="issue_date" type="date" value={form.issue_date} onChange={change} required />
        </div>
        <div className="form-group">
          <label>Maturity</label>
          <input name="maturity" type="date" value={form.maturity} onChange={change} required />
        </div>
        <div className="form-group">
          <label>Coupon (0-1)</label>
          <input name="coupon" type="number" min="0" max="1" step="0.00001" value={form.coupon} onChange={change} />
        </div>
        <div className="form-group">
          <label>Index Code</label>
          <select name="index_code" value={form.index_code || ''} onChange={change}>
            <option value="">None</option>
            {indexOptions.map((optRaw, i) => {
              const opt = renderIndexOption(optRaw);
              return <option key={i + '_' + opt.value} value={opt.value}>{opt.label}</option>;
            })}
          </select>
        </div>
        <div className="form-group">
          <label>Offset Days (≤0)</label>
          <input name="offset_days" type="number" max="0" step="1" value={form.offset_days} onChange={change} />
        </div>
        <div className="form-group">
          <label>Day Count Convention</label>
          <select name="day_count_conv_id" value={form.day_count_conv_id} onChange={change} required>
            <option value="">Select Convention</option>
            {conventionOptions.map(opt =>
              <option key={opt.id} value={opt.id}>
                {opt.code}{opt.description ? ` - ${opt.description}` : ''}
              </option>
            )}
          </select>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-success">Save</button>{' '}
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
