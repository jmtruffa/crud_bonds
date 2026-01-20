import React, { useState } from 'react';
import CashflowUploader from './CashflowUploader';
import { levenshteinDistance } from '../levenshteinDist';

export default function BondList({ bonds, onEdit, onDelete, onClone }) {
  const [expandedId, setExpandedId] = useState(null);
  const [showCashflows, setShowCashflows] = useState({});
  const [searchTicker, setSearchTicker] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const [sortBy, setSortBy] = useState('id');
const [sortOrder, setSortOrder] = useState('desc');

  const toggleAccordion = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleCashflows = (id) => {
    setShowCashflows(prev => ({ ...prev, [id]: !prev[id] }));
  };

 // Filter and sort bonds with fuzzy search
let filteredBonds = bonds.filter(b => {
  if (!searchTicker.trim()) return true;
  
  const search = searchTicker.toLowerCase().trim();
  const ticker = b.ticker.toLowerCase();
  
  // Exact match o substring
  if (ticker.includes(search)) return true;
  
  // Fuzzy match con Levenshtein
  const maxDistance = search.length <= 3 ? 1 : 2;
  const distance = levenshteinDistance(search, ticker);
  
  return distance <= maxDistance;
});

// Sort
filteredBonds.sort((a, b) => {
  let aVal = a[sortBy];
  let bVal = b[sortBy];
  
  // Manejo de fechas
  if (sortBy === 'issue_date' || sortBy === 'maturity' || sortBy === 'created_at') {
    aVal = new Date(aVal);
    bVal = new Date(bVal);
  }
  
  // Manejo de strings (ticker)
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
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedBonds = filteredBonds.slice(startIdx, endIdx);

  // Reset to page 1 when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTicker, sortBy, sortOrder]);

  return (
    <div className="bond-list-container">
      {bonds.length > 0 && (
        <>
        <div className="search-bar">
          <input
            type="text"
            placeholder="🔍 Search by ticker..."
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value)}
            className="search-input"
          />
          <span className="search-count">
            {filteredBonds.length} bond{filteredBonds.length !== 1 ? 's' : ''} found
          </span>
        </div>

        <div className="filter-bar">
  <label>Sort by:</label>
  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
    <option value="ticker">Ticker (A-Z)</option>
    <option value="issue_date">Issue Date</option>
    <option value="maturity">Maturity</option>
    <option value="created_at">Created At</option>
  </select>
  <button className="btn btn-secondary btn-sm" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
    {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
  </button>
</div>
  </>
      )}

      <div className="accordion-container">
        {paginatedBonds.length > 0 ? (
          paginatedBonds.map(b => (
            <div key={b.id} className="accordion-item">
              <button 
                className="accordion-header"
                onClick={() => toggleAccordion(b.id)}
              >
                <span className="accordion-toggle">{expandedId === b.id ? '▼' : '▶'}</span>
                <strong>{b.ticker}</strong>
              </button>

              {expandedId === b.id && (
                <div className="accordion-content">
                  <div className="bond-details">
                    <p><strong>Issue Date:</strong> {typeof b.issue_date === 'string' ? b.issue_date.split('T')[0] : b.issue_date}</p>
                    <p><strong>Maturity:</strong> {typeof b.maturity === 'string' ? b.maturity.split('T')[0] : b.maturity}</p>
                    <p><strong>Coupon:</strong> {b.coupon}</p>
                    <p><strong>Index Code:</strong> {b.index_code || 'None'}</p>
                    <p><strong>Offset Days:</strong> {b.offset_days}</p>
                    <p><strong>Day Count Conv:</strong> {b.day_count_conv}</p>
                  </div>

                  <div className="accordion-actions">
                    <button 
                      className="btn"
                      onClick={() => toggleCashflows(b.id)}
                    >
                      {showCashflows[b.id] ? '▼ Hide' : '▶ Show'} Cashflows
                    </button>
                    <button className="btn btn-secondary" onClick={() => onEdit(b)}>Edit Bond</button>
                    <button className="btn btn-success" onClick={() => onClone(b)}> Clone Bond</button>
                    <button className="btn btn-danger" onClick={() => onDelete(b.id)}>Delete Bond</button>
                  </div>

                  {showCashflows[b.id] && (
                    <div className="cashflows-section">
                      <CashflowUploader bond={b} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="no-results">No bonds found</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="btn btn-secondary"
          >
            ← Previous
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
