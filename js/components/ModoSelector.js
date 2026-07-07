// ============================================
// SELECTOR DE MODO
// ============================================

function ModoSelector({ onSelect, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div style={{
      padding: 20,
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏪</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>DistribuPanel</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Selecciona el modo de operación</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {isAdmin && (
          <button
            onClick={() => onSelect('admin')}
            style={{
              background: '#1e293b',
              border: 'none',
              borderRadius: 16,
              padding: 20,
              color: '#f1f5f9',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ fontWeight: 700 }}>Administrador</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Panel completo</div>
          </button>
        )}

        <button
          onClick={() => onSelect('reparto')}
          style={{
            background: '#1e293b',
            border: 'none',
            borderRadius: 16,
            padding: 20,
            color: '#f1f5f9',
            cursor: 'pointer',
            textAlign: 'center',
            gridColumn: isAdmin ? 'span 1' : '1 / -1'
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚚</div>
          <div style={{ fontWeight: 700 }}>Reparto</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Gestión de rutas y entregas
          </div>
        </button>
      </div>
    </div>
  );
}

// Registrar componente global
window.ModoSelector = ModoSelector;