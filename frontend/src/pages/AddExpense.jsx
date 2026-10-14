import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTripMembers, addExpense } from '../api/expense';
import { AuthContext } from '../context/AuthContext';
import '../styles/expense.css';

/**
 * AddExpense Page
 * Strict implementation of activity diagram:
 * 1. Select Active Trip
 * 2. Add Expense (Amount, Category, Payer, Currency, Members)
 * 3. Submit Expense (Triggers validation)
 * 4. Validate expense Details -> [NO: Display error, Return] -> [YES: Calculate expense shares, Record in trip ledger]
 */
const AddExpense = () => {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Form inputs
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [payerId, setPayerId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom'
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [customShares, setCustomShares] = useState({});

  const [validationErrors, setValidationErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoadingMembers(true);
      try {
        const res = await getTripMembers(tripId);
        const mems = res.data || [];
        setMembers(mems);

        // Pre-select current user as payer if in members
        if (user) {
          const currentInTrip = mems.find((m) => m.user_id === user.id);
          if (currentInTrip) {
            setPayerId(currentInTrip.user_id.toString());
          } else if (mems.length > 0) {
            setPayerId(mems[0].user_id.toString());
          }
        }

        // Default all members selected for equal split
        const allIds = mems.map((m) => m.user_id);
        setSelectedMemberIds(allIds);

        // Initialize empty custom shares
        const initialCustom = {};
        mems.forEach((m) => {
          initialCustom[m.user_id] = '';
        });
        setCustomShares(initialCustom);
      } catch (err) {
        setApiError('Failed to load trip members. You must be an active member of this trip.');
      } finally {
        setLoadingMembers(false);
      }
    };

    if (tripId) {
      fetchMembers();
    }
  }, [tripId, user]);

  const handleMemberToggle = (id) => {
    if (selectedMemberIds.includes(id)) {
      setSelectedMemberIds(selectedMemberIds.filter((mId) => mId !== id));
    } else {
      setSelectedMemberIds([...selectedMemberIds, id]);
    }
  };

  const handleSelectAll = () => {
    setSelectedMemberIds(members.map((m) => m.user_id));
  };

  const handleCustomShareChange = (userId, val) => {
    setCustomShares((prev) => ({ ...prev, [userId]: val }));
  };

  const currentCustomTotal = Object.values(customShares).reduce(
    (acc, val) => acc + (parseFloat(val) || 0),
    0
  );

  // Client-side validation before triggering submit
  const validateForm = () => {
    const errs = {};
    if (!title.trim()) {
      errs.title = 'Expense title is required.';
    }

    const parsedAmt = parseFloat(amount);
    if (!parsedAmt || parsedAmt <= 0) {
      errs.amount = 'Amount must be greater than 0.';
    }

    if (!payerId) {
      errs.payerId = 'Please select who paid for this expense.';
    }

    if (splitType === 'equal') {
      if (selectedMemberIds.length === 0) {
        errs.members = 'Select at least one member to split the expense with.';
      }
    } else if (splitType === 'custom') {
      const diff = Math.abs(currentCustomTotal - parsedAmt);
      if (diff > 0.05) {
        errs.custom = `Custom shares sum to ${currentCustomTotal.toFixed(2)}, which must equal ${parsedAmt.toFixed(2)}.`;
      }
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs);
      return;
    }
    setValidationErrors({});

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        category,
        description: description.trim() || null,
        payer_id: parseInt(payerId, 10),
        split_type: splitType,
        member_ids: splitType === 'equal' ? selectedMemberIds : [],
        custom_splits:
          splitType === 'custom'
            ? Object.entries(customShares)
                .filter(([_, val]) => parseFloat(val) > 0)
                .map(([uid, val]) => ({
                  user_id: parseInt(uid, 10),
                  share_amount: parseFloat(val),
                }))
            : [],
      };

      await addExpense(tripId, payload);
      navigate(`/trips/${tripId}/expenses`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setApiError(detail);
      } else if (Array.isArray(detail)) {
        setApiError(detail.map((d) => d.msg).join(', '));
      } else {
        setApiError('Failed to record expense. Please review inputs and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingMembers) {
    return (
      <div className="trip-page-container">
        <div className="loading-container" style={{ height: '300px' }}>
          <div className="spinner"></div>
          <p>Loading trip members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trip-page-container">
      <div className="page-header">
        <div>
          <h1>Add Expense</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Record an expense in the trip ledger and calculate splits for affected members.
          </p>
        </div>
        <Link to={`/trips/${tripId}/expenses`} className="btn btn-secondary btn-sm">
          &larr; Back to Expenses
        </Link>
      </div>

      <div className="trip-detail-card" style={{ maxWidth: '680px', margin: '0 auto' }}>
        {apiError && <div className="alert alert-error">{apiError}</div>}

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="form-group">
            <label htmlFor="expenseTitle">Expense Title / Item *</label>
            <input
              id="expenseTitle"
              type="text"
              placeholder="e.g., Seafood Dinner, Train Tickets, Airbnb"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {validationErrors.title && <span className="error-text">{validationErrors.title}</span>}
          </div>

          {/* Amount & Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="expenseAmount">Amount *</label>
              <input
                id="expenseAmount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {validationErrors.amount && <span className="error-text">{validationErrors.amount}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="expenseCurrency">Currency *</label>
              <select
                id="expenseCurrency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="INR">INR (₹)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>
          </div>

          {/* Category & Payer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="expenseCategory">Category *</label>
              <select
                id="expenseCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="Food & Dining">Food & Dining</option>
                <option value="Transport">Transport</option>
                <option value="Accommodation">Accommodation</option>
                <option value="Activities & Entertainment">Activities & Entertainment</option>
                <option value="Shopping">Shopping</option>
                <option value="Groceries">Groceries</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="expensePayer">Paid By (Payer) *</label>
              <select
                id="expensePayer"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} {user && m.user_id === user.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
              {validationErrors.payerId && <span className="error-text">{validationErrors.payerId}</span>}
            </div>
          </div>

          {/* Split Mode Toggle */}
          <div style={{ margin: '15px 0' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Split Mode</label>
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${splitType === 'equal' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSplitType('equal')}
              >
                Split Equally
              </button>
              <button
                type="button"
                className={`btn btn-sm ${splitType === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSplitType('custom')}
              >
                Custom Split
              </button>
            </div>
          </div>

          {/* Members Selection (Equal Mode) */}
          {splitType === 'equal' ? (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ margin: 0 }}>Split Among Members ({selectedMemberIds.length} selected):</label>
                <button type="button" className="btn btn-text" style={{ fontSize: '0.8rem' }} onClick={handleSelectAll}>
                  Select All
                </button>
              </div>

              <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {members.map((m) => (
                  <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(m.user_id)}
                      onChange={() => handleMemberToggle(m.user_id)}
                    />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
              {validationErrors.members && <span className="error-text">{validationErrors.members}</span>}

              {selectedMemberIds.length > 0 && parseFloat(amount) > 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Approx share per member: ~{currency} {(parseFloat(amount) / selectedMemberIds.length).toFixed(2)}
                </div>
              )}
            </div>
          ) : (
            /* Custom Split Mode */
            <div className="form-group">
              <label>Specify Custom Amount for Each Member:</label>
              <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {members.map((m) => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.9rem' }}>{m.name}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={customShares[m.user_id] || ''}
                      onChange={(e) => handleCustomShareChange(m.user_id, e.target.value)}
                      style={{ width: '110px', textAlign: 'right', padding: '6px 8px' }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.85rem' }}>
                <span>Total Shares: {currentCustomTotal.toFixed(2)}</span>
                <span style={{ color: Math.abs(currentCustomTotal - (parseFloat(amount) || 0)) < 0.05 ? '#34d399' : '#f87171' }}>
                  Target: {(parseFloat(amount) || 0).toFixed(2)}
                </span>
              </div>
              {validationErrors.custom && <span className="error-text">{validationErrors.custom}</span>}
            </div>
          )}

          {/* Description */}
          <div className="form-group">
            <label htmlFor="expenseDesc">Description or Note (optional)</label>
            <textarea
              id="expenseDesc"
              rows={2}
              placeholder="Add details, notes, or receipts info..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'inherit' }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
            style={{ marginTop: '15px' }}
          >
            {isSubmitting ? 'Recording Expense in Ledger...' : 'Submit Expense (Split & Record)'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddExpense;
