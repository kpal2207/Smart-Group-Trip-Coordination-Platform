import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTripExpenseDashboard, acceptExpense } from '../api/expense';
import { AuthContext } from '../context/AuthContext';
import DisputeModal from '../components/DisputeModal';
import SettleUpModal from '../components/SettleUpModal';
import '../styles/expense.css';

/**
 * ExpenseDashboard Page
 * Central hub for the Expense Management & Splitting Feature.
 * Matches activity diagram:
 * - Active Trip View
 * - 'WHO OWES WHOM' Dashboard
 * - Expense Ledger & Status
 * - Dispute / Acceptance Flow
 * - Settlement & Balance Clearing Flow
 */
const ExpenseDashboard = () => {
  const { tripId } = useParams();
  const { user } = useContext(AuthContext);

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  // Modals state
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeModalMode, setDisputeModalMode] = useState('create'); // 'create' | 'review'
  const [activeExpense, setActiveExpense] = useState(null);
  const [activeDispute, setActiveDispute] = useState(null);

  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settlePayeeId, setSettlePayeeId] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await getTripExpenseDashboard(tripId);
      setDashboard(res.data);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to load expense dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tripId) {
      fetchDashboard();
    }
  }, [tripId]);

  // Acceptance action
  const handleAcceptExpense = async (expenseId) => {
    try {
      await acceptExpense(expenseId);
      setActionSuccessMsg('Expense accepted.');
      fetchDashboard();
      setTimeout(() => setActionSuccessMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to accept expense.');
    }
  };

  // Open dispute creation modal
  const handleOpenDispute = (expense) => {
    setActiveExpense(expense);
    setDisputeModalMode('create');
    setDisputeModalOpen(true);
  };

  // Open host review modal
  const handleOpenHostReview = (expense) => {
    setActiveExpense(expense);
    const pendingDispute = expense.disputes.find((d) => d.status === 'pending') || expense.disputes[0];
    setActiveDispute(pendingDispute);
    setDisputeModalMode('review');
    setDisputeModalOpen(true);
  };

  // Open settle up modal
  const handleOpenSettleUp = (payeeId = null, amount = '') => {
    setSettlePayeeId(payeeId);
    setSettleAmount(amount);
    setSettleModalOpen(true);
  };

  if (loading) {
    return (
      <div className="trip-page-container">
        <div className="loading-container" style={{ height: '300px' }}>
          <div className="spinner"></div>
          <p>Loading expense ledger & balances...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="trip-page-container">
        <div className="page-header">
          <Link to={`/trips/${tripId}`} className="btn btn-secondary btn-sm">
            &larr; Back to Trip
          </Link>
        </div>
        <div className="alert alert-error">
          <p>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  // Calculate current user's net position
  const myBalance = dashboard.member_balances.find((b) => b.user_id === user?.id);
  const myNet = myBalance ? parseFloat(myBalance.net_balance) : 0;

  return (
    <div className="trip-page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1>{dashboard.trip_title} — Expenses</h1>
            <span className={`badge ${dashboard.trip_status === 'settled' ? 'badge-member' : 'badge-host'}`} style={{ backgroundColor: dashboard.trip_status === 'settled' ? '#10b981' : '#6366f1' }}>
              {dashboard.trip_status === 'settled' ? '✓ Finished & Settled' : '● Active Trip'}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Collaborative expense ledger, split tracking, and settlements.
          </p>
        </div>

        <div className="page-header-actions">
          <button type="button" onClick={fetchDashboard} className="btn btn-secondary btn-sm">
            ↻ Refresh
          </button>
          <Link to={`/trips/${tripId}`} className="btn btn-secondary btn-sm">
            Trip Details
          </Link>
          <button
            type="button"
            onClick={() => handleOpenSettleUp()}
            className="btn btn-secondary btn-sm"
          >
            Settle Up
          </button>
          <Link to={`/trips/${tripId}/expenses/add`} className="btn btn-primary btn-sm">
            + Add Expense
          </Link>
        </div>
      </div>

      {actionSuccessMsg && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{actionSuccessMsg}</div>}

      {/* Completion & Pending Status Banners */}
      {dashboard.all_balances_cleared ? (
        <div className="settlement-banner-complete">
          <div>
            <strong>🎉 Settlement Complete!</strong> All member balances have been fully cleared. This trip is finished.
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Zero Outstanding Debt</span>
        </div>
      ) : (
        <div className="settlement-banner-pending">
          <div>
            <strong>Pending Balances Remaining:</strong> Total of {dashboard.currency}{' '}
            {parseFloat(dashboard.pending_balance_amount).toFixed(2)} in outstanding debts needs to be settled.
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => handleOpenSettleUp()}
          >
            Settle Balances
          </button>
        </div>
      )}

      {/* Key Stats Bar */}
      <div className="expense-header-stats">
        <div className="stat-card">
          <div className="stat-card-title">Total Trip Expenses</div>
          <div className="stat-card-value">
            ${parseFloat(dashboard.total_expenses).toFixed(2)}
          </div>
          <div className="stat-card-subtitle">{dashboard.expenses.length} ledger entries</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Your Net Balance</div>
          <div
            className="stat-card-value"
            style={{ color: myNet > 0.01 ? '#34d399' : myNet < -0.01 ? '#f87171' : 'var(--text-muted)' }}
          >
            {myNet > 0.01
              ? `+$${myNet.toFixed(2)}`
              : myNet < -0.01
              ? `-$${Math.abs(myNet).toFixed(2)}`
              : '$0.00'}
          </div>
          <div className="stat-card-subtitle">
            {myNet > 0.01 ? 'You are owed money' : myNet < -0.01 ? 'You owe money' : 'You are settled up'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Active Members</div>
          <div className="stat-card-value">{dashboard.members.length}</div>
          <div className="stat-card-subtitle">
            {dashboard.is_host ? 'You are Trip Host' : 'Enrolled Member'}
          </div>
        </div>
      </div>

      {/* Main 2-Column Dashboard */}
      <div className="expense-dashboard-grid">
        {/* Left Column: Expense Ledger */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>Trip Ledger</h2>
            <Link to={`/trips/${tripId}/expenses/add`} className="btn btn-primary btn-sm">
              + Add Expense
            </Link>
          </div>

          {dashboard.expenses.length === 0 ? (
            <div className="empty-state">
              <h3>No expenses recorded yet</h3>
              <p>Add your first trip expense to begin splitting costs among group members.</p>
              <Link to={`/trips/${tripId}/expenses/add`} className="btn btn-primary" style={{ marginTop: '10px' }}>
                Add First Expense
              </Link>
            </div>
          ) : (
            <div className="ledger-container">
              {dashboard.expenses.map((exp) => {
                const mySplit = exp.splits.find((s) => s.user_id === user?.id);
                const isDisputed = exp.status === 'disputed';
                const isAccepted = exp.status === 'accepted';
                const hasPendingDispute = exp.disputes.some((d) => d.status === 'pending');

                return (
                  <div
                    key={exp.id}
                    className={`expense-item-card ${isDisputed ? 'disputed' : ''}`}
                  >
                    <div className="expense-card-top">
                      <div>
                        <div className="expense-card-title">{exp.title}</div>
                        <div className="expense-card-meta">
                          <span>🏷 {exp.category}</span>
                          <span>💳 Paid by <strong>{exp.payer_name}</strong></span>
                          <span>🗓 {new Date(exp.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="expense-amount-badge">
                        <div className="amount">
                          {exp.currency} {parseFloat(exp.amount).toFixed(2)}
                        </div>
                        <span
                          className={`badge ${
                            isAccepted ? 'badge-member' : isDisputed ? 'badge-host' : ''
                          }`}
                          style={{
                            fontSize: '0.75rem',
                            marginTop: '4px',
                            background: isAccepted
                              ? 'rgba(16, 185, 129, 0.2)'
                              : isDisputed
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                            color: isAccepted ? '#34d399' : isDisputed ? '#f87171' : '#fbbf24',
                            border: 'none',
                          }}
                        >
                          {isAccepted ? '✓ Accepted' : isDisputed ? '⚠️ Disputed' : '⏳ Pending Review'}
                        </span>
                      </div>
                    </div>

                    {exp.description && (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                        {exp.description}
                      </p>
                    )}

                    {/* Split Breakdown */}
                    <div className="split-pills">
                      {exp.splits.map((s) => (
                        <div
                          key={s.id}
                          className={`split-pill ${s.is_accepted ? 'accepted' : ''}`}
                        >
                          <span>{s.user_name}:</span>
                          <strong>{exp.currency} {parseFloat(s.share_amount).toFixed(2)}</strong>
                          {s.is_accepted && <span style={{ color: '#34d399' }}>✓</span>}
                        </div>
                      ))}
                    </div>

                    {/* Dispute Box if Active */}
                    {isDisputed && (
                      <div className="dispute-alert-box">
                        <h4>⚠️ Expense Disputed</h4>
                        {exp.disputes.map((d) => (
                          <div key={d.id} style={{ marginTop: '4px' }}>
                            <strong>{d.raised_by_name}:</strong> "{d.reason}"
                          </div>
                        ))}

                        {dashboard.is_host && hasPendingDispute && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            style={{ marginTop: '10px' }}
                            onClick={() => handleOpenHostReview(exp)}
                          >
                            Review & Resolve Dispute
                          </button>
                        )}
                      </div>
                    )}

                    {/* Member Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                      {/* Non-payer can dispute or accept */}
                      {mySplit && exp.payer_id !== user?.id && !isAccepted && !isDisputed && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: '#f87171' }}
                            onClick={() => handleOpenDispute(exp)}
                          >
                            Dispute Split
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAcceptExpense(exp.id)}
                          >
                            Accept Expense
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Who Owes Whom & Balances */}
        <div>
          {/* Who Owes Whom Card */}
          <div className="trip-detail-card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Who Owes Whom</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Simplified debt transfers calculated automatically:
            </p>

            {dashboard.who_owes_whom.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#34d399', fontSize: '0.9rem' }}>
                ✓ All debts are settled!
              </div>
            ) : (
              <div className="owes-list">
                {dashboard.who_owes_whom.map((item, idx) => {
                  const isMeDebtor = user && item.from_user_id === user.id;

                  return (
                    <div key={idx} className="owes-item">
                      <div>
                        <div className="owes-direction">
                          <strong>{item.from_user_name}</strong>
                          <span className="owes-arrow">&rarr;</span>
                          <strong>{item.to_user_name}</strong>
                        </div>
                        <div className="owes-amount">
                          ${parseFloat(item.amount).toFixed(2)}
                        </div>
                      </div>

                      {isMeDebtor && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                          onClick={() => handleOpenSettleUp(item.to_user_id, item.amount)}
                        >
                          Settle
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Member Net Balances Card */}
          <div className="trip-detail-card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Member Balances</h3>
            <div className="member-balance-list">
              {dashboard.member_balances.map((m) => {
                const net = parseFloat(m.net_balance);
                return (
                  <div key={m.user_id} className="member-balance-row">
                    <div>
                      <strong>{m.user_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Paid: ${parseFloat(m.total_paid).toFixed(2)} | Share: ${parseFloat(m.total_share).toFixed(2)}
                      </div>
                    </div>
                    <div className={net > 0.01 ? 'balance-positive' : net < -0.01 ? 'balance-negative' : 'balance-zero'}>
                      {net > 0.01 ? `+$${net.toFixed(2)}` : net < -0.01 ? `-$${Math.abs(net).toFixed(2)}` : '$0.00'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Settlements History Card */}
          <div className="trip-detail-card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Settlements Log</h3>
            {dashboard.settlements.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No settlements recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dashboard.settlements.map((s) => (
                  <div key={s.id} style={{ fontSize: '0.85rem', padding: '8px', background: 'var(--bg-color)', borderRadius: '4px' }}>
                    <div>
                      <strong>{s.payer_name}</strong> paid <strong>{s.payee_name}</strong>: ${parseFloat(s.amount).toFixed(2)}
                    </div>
                    {s.notes && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Note: {s.notes}</div>}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dispute Modal */}
      <DisputeModal
        mode={disputeModalMode}
        expense={activeExpense}
        dispute={activeDispute}
        members={dashboard.members}
        isOpen={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        onSuccess={() => {
          setActionSuccessMsg('Dispute updated successfully.');
          fetchDashboard();
        }}
      />

      {/* Settle Up Modal */}
      <SettleUpModal
        tripId={tripId}
        members={dashboard.members.filter((m) => m.user_id !== user?.id)}
        defaultPayeeId={settlePayeeId}
        defaultAmount={settleAmount}
        isOpen={settleModalOpen}
        onClose={() => setSettleModalOpen(false)}
        onSuccess={() => {
          setActionSuccessMsg('Payment recorded and balances updated.');
          fetchDashboard();
        }}
      />
    </div>
  );
};

export default ExpenseDashboard;
