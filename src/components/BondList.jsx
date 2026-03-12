import React, { useState, useEffect } from 'react';
import CashflowUploader from './CashflowUploader';
import BondReadOnlyRow from './BondReadOnlyRow';
import BondEditableRow from './BondEditableRow';
import { damerauLevenshteinOSA } from '../utils/stringDistance';
import { getIndexes, getDayCountConventions } from '../api';

export default function BondList({ bonds, onSave, onRefresh }) {
  const [searchTicker, setSearchTicker] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('desc');

  const [editingId, setEditingId] = useState(null); // bond.id or 'new'
  const [editData, setEditData] = useState({});
  const [expandedCfId, setExpandedCfId] = useState(null);

  const [indexOptions, setIndexOptions] = useState([]);
  const [conventionOptions, setConventionOptions] = useState([]);

  useEffect(() => {
    Promise.all([getIndexes(), getDayCountConventions()])
      .then(([idx, conv]) => {
        setIndexOptions(idx || []);
        setConventionOptions(conv || []);
      })
      .catch(console.error);
  }, []);

  // Filter with fuzzy search
  let filteredBonds = bonds.filter(b => {
    if (!searchTicker.trim()) return true;
    const search = searchTicker.toLowerCase().trim();
    const ticker = b.ticker.toLowerCase();
    if (ticker.includes(search)) return true;
    const maxDistance = search.length <= 3 ? 1 : 2;
    return damerauLevenshteinOSA(search, ticker) <= maxDistance;
  });

  // Sort
  filteredBonds.sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    if (sortBy === 'issue_date' || sortBy === 'maturity' || sortBy === 'created_at') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    }
    if (sortBy === 'ticker') {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(filteredBonds.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedBonds = filteredBonds.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [searchTicker, sortBy, sortOrder]);

  const fmtDate = (d) => (typeof d === 'string' ? d.split('T')[0] : d) || '';

  function startEdit(bond) {
    setEditingId(bond.id);
    setEditData({
      ticker: bond.ticker,
      issue_date: fmtDate(bond.issue_date),
      maturity: fmtDate(bond.maturity),
      coupon: bond.coupon,
      index_code: bond.index_code || '',
      offset_days: bond.offset_days,
      day_count_conv_id: bond.day_count_conv_id,
      active: bond.active !== false,
    });
  }

  function startNew() {
    setEditingId('new');
    setEditData({
      ticker: '', issue_date: '', maturity: '', coupon: 0,
      index_code: '', offset_days: 0, day_count_conv_id: '', active: true,
    });
  }

  function startClone(bond) {
    setEditingId('new');
    setEditData({
      ticker: `${bond.ticker}_COPY`,
      issue_date: fmtDate(bond.issue_date),
      maturity: fmtDate(bond.maturity),
      coupon: bond.coupon,
      index_code: bond.index_code || '',
      offset_days: bond.offset_days,
      day_count_conv_id: bond.day_count_conv_id,
      active: bond.active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData({});
  }

  async function saveEdit() {
    const payload = {
      ...editData,
      coupon: Number(editData.coupon),
      offset_days: Number(editData.offset_days),
    };
    if (payload.issue_date && payload.maturity && payload.issue_date >= payload.maturity) {
      alert('Maturity date must be after Issue date');
      return;
    }
    if (!payload.ticker || !payload.issue_date || !payload.maturity || !payload.day_count_conv_id) {
      alert('Please fill all required fields (ticker, dates, day count convention)');
      return;
    }
    try {
      await onSave(editingId === 'new' ? null : editingId, payload);
      cancelEdit();
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  function handleFieldChange(field, value) {
    setEditData(prev => ({ ...prev, [field]: value }));
  }

  return (
    <div className="bond-list-container">
      <div className="table-toolbar">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by ticker..."
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value)}
            className="search-input"
          />
          <span className="search-count">
            {filteredBonds.length} bond{filteredBonds.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="toolbar-right">
          <div className="filter-bar">
            <label>Sort:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
              <option value="ticker">Ticker</option>
              <option value="issue_date">Issue Date</option>
              <option value="maturity">Maturity</option>
              <option value="created_at">Created</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          <button className="btn btn-success" onClick={startNew} disabled={editingId !== null}>
            + New Bond
          </button>
        </div>
      </div>

      <div className="table-scroll-wrapper">
        <table className="table bond-table">
          <thead>
            <tr>
              <th style={{ width: '36px' }}></th>
              <th>Ticker</th>
              <th>Issue Date</th>
              <th>Maturity</th>
              <th>Coupon</th>
              <th>Index</th>
              <th>Offset</th>
              <th>Day Count</th>
              <th>Active</th>
              <th style={{ width: '130px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {editingId === 'new' && (
              <BondEditableRow
                data={editData}
                onChange={handleFieldChange}
                onSave={saveEdit}
                onCancel={cancelEdit}
                indexOptions={indexOptions}
                conventionOptions={conventionOptions}
              />
            )}
            {paginatedBonds.length > 0 ? (
              paginatedBonds.map(b => (
                <React.Fragment key={b.id}>
                  {editingId === b.id ? (
                    <BondEditableRow
                      data={editData}
                      onChange={handleFieldChange}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      indexOptions={indexOptions}
                      conventionOptions={conventionOptions}
                    />
                  ) : (
                    <BondReadOnlyRow
                      bond={b}
                      onEdit={() => startEdit(b)}
                      onClone={() => startClone(b)}
                      onToggleCashflows={() => setExpandedCfId(expandedCfId === b.id ? null : b.id)}
                      isExpanded={expandedCfId === b.id}
                    />
                  )}
                  {expandedCfId === b.id && (
                    <tr className="cashflow-expand-row">
                      <td colSpan={10}>
                        <CashflowUploader bond={b} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              editingId !== 'new' && (
                <tr>
                  <td colSpan={10} className="no-results">No bonds found</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="btn btn-secondary"
          >
            ← Prev
          </button>
          <div className="page-info">
            Page <span className="page-number">{currentPage}</span> of <span className="page-number">{totalPages}</span>
          </div>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="btn btn-secondary"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
