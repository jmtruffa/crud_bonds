export default function BondEditableRow({ data, onChange, onSave, onCancel, indexOptions, conventionOptions }) {
  return (
    <tr className="editing-row">
      <td></td>
      <td>
        <input className="cell-input" value={data.ticker} onChange={e => onChange('ticker', e.target.value)} autoFocus required />
      </td>
      <td>
        <input className="cell-input" type="date" value={data.issue_date} onChange={e => onChange('issue_date', e.target.value)} required />
      </td>
      <td>
        <input className="cell-input" type="date" value={data.maturity} onChange={e => onChange('maturity', e.target.value)} required />
      </td>
      <td>
        <input className="cell-input" type="number" min="0" max="1" step="0.00001" value={data.coupon} onChange={e => onChange('coupon', e.target.value)} />
      </td>
      <td>
        <select className="cell-select" value={data.index_code} onChange={e => onChange('index_code', e.target.value)}>
          <option value="">None</option>
          {indexOptions.map(opt => {
            const val = typeof opt === 'string' ? opt : (opt.code ?? '');
            return <option key={val} value={val}>{val}</option>;
          })}
        </select>
      </td>
      <td>
        <input className="cell-input" type="number" max="0" step="1" value={data.offset_days} onChange={e => onChange('offset_days', e.target.value)} />
      </td>
      <td>
        <select className="cell-select" value={data.day_count_conv_id} onChange={e => onChange('day_count_conv_id', e.target.value)} required>
          <option value="">Select</option>
          {conventionOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.code}</option>
          ))}
        </select>
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={data.active !== false && data.active !== 'false'} onChange={e => onChange('active', e.target.checked)} />
      </td>
      <td>
        <div className="table-action-group">
          <button className="btn btn-sm btn-success" onClick={onSave}>Save</button>
          <button className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}
