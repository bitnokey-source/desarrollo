function RutaRepartoAvanzado({ productos, clientes, notas, rutas, currentUser }) {
  const [view, setView] = useState('rutas'); // rutas | nueva | detalle | entrega | historial
  const [rutaActual, setRutaActual] = useState(null);
  const [cart, setCart] = useState([]);
  const [ubicacion, setUbicacion] = useState(null);
  const [clienteActual, setClienteActual] = useState(null);
  const [modoOffline, setModoOffline] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientesSeleccionados, setClientesSeleccionados] = useState([]);
  const [historialRutas, setHistorialRutas] = useState([]);

  // ============================================
  // 1. MODO OFFLINE
  // ============================================
  useEffect(() => {
    const handleOnline = () => {
      setModoOffline(false);
      sincronizarOffline();
    };
    const handleOffline = () => setModoOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cargar ruta actual desde localStorage si existe
    const saved = localStorage.getItem('rutaActual');
    if (saved) {
      try {
        setRutaActual(JSON.parse(saved));
      } catch (e) {}
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const sincronizarOffline = async () => {
    const pendientes = JSON.parse(localStorage.getItem('entregasPendientes') || '[]');
    for (const entrega of pendientes) {
      try {
        await db.collection('entregas').add(entrega);
      } catch (e) {
        console.error('Error sincronizando:', e);
      }
    }
    localStorage.removeItem('entregasPendientes');
  };

  const guardarOffline = (entrega) => {
    const pendientes = JSON.parse(localStorage.getItem('entregasPendientes') || '[]');
    pendientes.push(entrega);
    localStorage.setItem('entregasPendientes', JSON.stringify(pendientes));
    alert('📱 Guardado en modo offline. Se sincronizará cuando tengas internet.');
  };

  // ============================================
  // 2. PLANIFICAR RUTA
  // ============================================
  const planificarRuta = (clientesIds) => {
    const seleccionados = clientes.filter(c => clientesIds.includes(c.id) && c.activo);
    if (seleccionados.length === 0) {
      alert('Selecciona al menos un cliente activo');
      return;
    }

    // Ordenar por ubicación (simulado)
    const ordenados = seleccionados.sort((a, b) => {
      // Si tienen coordenadas, calcular distancia desde almacén
      if (a.coordenadas && b.coordenadas) {
        const distA = Math.abs(a.coordenadas.lat - 28.5) + Math.abs(a.coordenadas.lng + 106.0);
        const distB = Math.abs(b.coordenadas.lat - 28.5) + Math.abs(b.coordenadas.lng + 106.0);
        return distA - distB;
      }
      return 0;
    });

    const nuevaRuta = {
      id: 'ruta-' + uid(),
      fecha: new Date().toISOString(),
      repartidor: currentUser?.uid || '',
      repartidorNombre: currentUser?.nombre || '',
      estado: 'planificada',
      clientes: ordenados.map(c => ({ ...c, entregado: false, horaEntrega: null })),
      items: [],
      entregas: [],
      fechaFin: null,
      creadaPor: currentUser?.uid || ''
    };

    setRutaActual(nuevaRuta);
    localStorage.setItem('rutaActual', JSON.stringify(nuevaRuta));
    setView('detalle');
  };

  // ============================================
  // 3. NAVEGACIÓN CON MAPS
  // ============================================
  const abrirMapa = (cliente) => {
    // Si el cliente tiene coordenadas
    if (cliente.coordenadas) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${cliente.coordenadas.lat},${cliente.coordenadas.lng}`;
      window.open(url, '_blank');
    } else {
      // Buscar por dirección
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.domicilio || '')}`;
      window.open(url, '_blank');
    }
  };

  // ============================================
  // 4. REGISTRAR ENTREGA
  // ============================================
  const registrarEntrega = async (clienteId, items, formaPago) => {
    if (items.length === 0) {
      alert('Agrega al menos un producto');
      return;
    }

    setSaving(true);
    const total = items.reduce((s, i) => s + i.precio * i.cant, 0);

    try {
      const entrega = {
        rutaId: rutaActual.id,
        clienteId,
        clienteNombre: clientes.find(c => c.id === clienteId)?.nombre || '',
        fecha: new Date().toISOString(),
        items: items.map(i => ({ ...i })),
        total,
        formaPago,
        estado: 'entregado',
        ubicacion: ubicacion || { lat: 28.5, lng: -106.0 },
        firma: null
      };

      if (modoOffline) {
        guardarOffline(entrega);
        // Actualizar localmente
        actualizarRutaLocal(clienteId, items);
        setCart([]);
        setClienteActual(null);
        setView('detalle');
        setSaving(false);
        return;
      }

      // Guardar en Firestore
      await db.collection('entregas').add(entrega);

      // Crear nota de venta
      const notaData = {
        fecha: entrega.fecha,
        clienteId,
        clienteNombre: entrega.clienteNombre,
        items: items.map(i => ({ ...i })),
        total,
        formaPago,
        tipo: 'reparto',
        rutaId: rutaActual.id
      };
      await db.collection('notas').add(notaData);

      // Si es crédito, registrar crédito
      if (formaPago === 'credito') {
        await db.collection('creditos').add({
          clienteId,
          clienteNombre: entrega.clienteNombre,
          fecha: entrega.fecha,
          total,
          saldo: total,
          abonos: []
        });
      }

      // Descontar stock
      const batch = db.batch();
      items.forEach(item => {
        batch.update(db.collection('productos').doc(item.id), {
          stock: firebase.firestore.FieldValue.increment(-item.cant)
        });
      });
      await batch.commit();

      // Actualizar ruta
      actualizarRutaLocal(clienteId, items);

      alert('✅ Entrega registrada');
      setCart([]);
      setClienteActual(null);
      setView('detalle');
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  const actualizarRutaLocal = (clienteId, items) => {
    setRutaActual(prev => {
      const updated = {
        ...prev,
        clientes: prev.clientes.map(c =>
          c.id === clienteId
            ? { ...c, entregado: true, horaEntrega: new Date().toISOString() }
            : c
        ),
        entregas: [...(prev.entregas || []), { clienteId, items, fecha: new Date().toISOString() }]
      };
      localStorage.setItem('rutaActual', JSON.stringify(updated));
      return updated;
    });
  };

  // ============================================
  // 5. FINALIZAR RUTA
  // ============================================
  const finalizarRuta = async () => {
    if (!rutaActual) return;

    const pendientes = rutaActual.clientes.filter(c => !c.entregado);
    if (pendientes.length > 0) {
      if (!confirm(`⚠️ Faltan ${pendientes.length} clientes por entregar. ¿Finalizar de todos modos?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const rutaCompleta = {
        ...rutaActual,
        estado: 'completada',
        fechaFin: new Date().toISOString()
      };

      if (!modoOffline) {
        await db.collection('rutas').add(rutaCompleta);
      }

      localStorage.removeItem('rutaActual');
      setRutaActual(null);
      setView('rutas');
      alert('🎉 Ruta finalizada');
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  // ============================================
  // 6. RENDER
  // ============================================
  return (
    <div style={{ padding: '16px 12px', paddingBottom: 80 }}>
      {/* Header */}
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>🚚 Reparto</div>
        <Row style={{ gap: 6 }}>
          {modoOffline && <Tag color="#f59e0b">📡 Offline</Tag>}
          <BOut onClick={() => setView('historial')} style={{ fontSize: 11, padding: '4px 10px' }}>
            📋
          </BOut>
        </Row>
      </Row>
           {/* ========== VISTA: RUTAS ========== */}
      {view === 'rutas' && (
        <>
          {/* Ruta activa */}
          {rutaActual && rutaActual.estado !== 'completada' && (
            <Card style={{ borderLeft: '3px solid #38bdf8' }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Ruta activa</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {rutaActual.clientes?.length || 0} clientes
                  </div>
                </div>
                <BFill onClick={() => setView('detalle')} style={{ fontSize: 12 }}>
                  Ver ruta →
                </BFill>
              </Row>
              <div style={{ marginTop: 8 }}>
                <div style={{ background: '#0f172a', borderRadius: 10, height: 6 }}>
                  <div
                    style={{
                      background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                      borderRadius: 10,
                      height: 6,
                      width: `${(rutaActual.clientes?.filter(c => c.entregado).length || 0) / (rutaActual.clientes?.length || 1) * 100}%`
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {rutaActual.clientes?.filter(c => c.entregado).length || 0} / {rutaActual.clientes?.length || 0} entregas
                </div>
              </div>
            </Card>
          )}

          {/* Botones */}
          <Row style={{ gap: 8, marginBottom: 12 }}>
            <BFill
              onClick={() => setView('nueva')}
              style={{ flex: 1, padding: 12 }}
            >
              🗺️ Nueva ruta
            </BFill>
          </Row>

          {/* Sugerencia de clientes */}
          <Card>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>
              📍 CLIENTES RECOMENDADOS
            </div>
            {clientes.filter(c => c.activo).slice(0, 5).map(cli => (
              <Row
                key={cli.id}
                style={{
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid #0f172a'
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{cli.nombre}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{cli.domicilio || 'Sin dirección'}</div>
                </div>
                <BOut
                  onClick={() => abrirMapa(cli)}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  🧭
                </BOut>
              </Row>
            ))}
          </Card>

          {/* Historial rápido */}
          {rutas && rutas.length > 0 && (
            <Card>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>
                📋 ÚLTIMAS RUTAS
              </div>
              {rutas.slice(0, 3).map(r => (
                <Row key={r.id} style={{ justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span>{fDate(r.fecha)}</span>
                  <span>{r.clientes?.length || 0} clientes</span>
                  <Tag color={r.estado === 'completada' ? '#22c55e' : '#f59e0b'}>
                    {r.estado || 'pendiente'}
                  </Tag>
                </Row>
              ))}
            </Card>
          )}
        </>
      )}

      {/* ========== VISTA: NUEVA RUTA ========== */}
      {view === 'nueva' && (
        <Modal
          title="🗺️ Planificar ruta"
          onClose={() => setView('rutas')}
        >
          <div style={{ marginBottom: 12 }}>
            <Lbl>Selecciona clientes para la ruta</Lbl>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {clientes.filter(c => c.activo).map(c => (
                <Row
                  key={c.id}
                  style={{
                    padding: '8px 4px',
                    borderBottom: '1px solid #0f172a',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setClientesSeleccionados(prev =>
                      prev.includes(c.id)
                        ? prev.filter(id => id !== c.id)
                        : [...prev, c.id]
                    );
                  }}
                >
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: clientesSeleccionados.includes(c.id) ? '#38bdf8' : '#475569',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex'
                    }}
                  >
                    {clientesSeleccionados.includes(c.id) ? <ChkSq /> : <SqI />}
                  </button>
                  <div style={{ flex: 1, marginLeft: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nombre}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.domicilio || '—'}</div>
                  </div>
                </Row>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            {clientesSeleccionados.length} clientes seleccionados
          </div>

          <BFill
            onClick={() => {
              if (clientesSeleccionados.length === 0) {
                alert('Selecciona al menos un cliente');
                return;
              }
              planificarRuta(clientesSeleccionados);
              setClientesSeleccionados([]);
            }}
            style={{ width: '100%', padding: 12 }}
          >
            🚀 Iniciar ruta ({clientesSeleccionados.length} clientes)
          </BFill>
        </Modal>
      )}

      {/* ========== VISTA: DETALLE DE RUTA ========== */}
      {view === 'detalle' && rutaActual && (
        <>
          <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Ruta en progreso</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {rutaActual.clientes?.filter(c => c.entregado).length || 0} / {rutaActual.clientes?.length || 0} entregados
              </div>
            </div>
            <Row style={{ gap: 6 }}>
              <BOut onClick={() => finalizarRuta()} style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef4444' }}>
                🏁 Finalizar
              </BOut>
              <BOut onClick={() => setView('rutas')}>←</BOut>
            </Row>
          </Row>

          {rutaActual.clientes?.map((cliente, index) => (
            <Card
              key={cliente.id}
              style={{
                borderLeft: cliente.entregado ? '3px solid #22c55e' : '3px solid #f59e0b',
                opacity: cliente.entregado ? 0.6 : 1
              }}
            >
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{cliente.nombre}</span>
                    <Tag color="#64748b" style={{ fontSize: 10 }}>#{index + 1}</Tag>
                    {cliente.entregado && <Tag color="#22c55e">✅</Tag>}
                  </Row>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    📍 {cliente.domicilio || 'Sin dirección'}
                  </div>
                  {cliente.telefono && (
                    <a
                      href={`tel:${cliente.telefono}`}
                      style={{ fontSize: 12, color: '#38bdf8', textDecoration: 'none', display: 'inline-block', marginTop: 2 }}
                    >
                      📞 Llamar
                    </a>
                  )}
                </div>
                <Row style={{ gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => abrirMapa(cliente)}
                    style={{
                      background: '#172554',
                      border: 'none',
                      color: '#60a5fa',
                      borderRadius: 6,
                      padding: '5px 9px',
                      cursor: 'pointer'
                    }}
                  >
                    🧭
                  </button>
                  {!cliente.entregado && (
                    <BFill
                      onClick={() => {
                        setClienteActual(cliente);
                        setCart([]);
                        setView('entrega');
                      }}
                      style={{ fontSize: 11, padding: '5px 10px' }}
                    >
                      📦
                    </BFill>
                  )}
                </Row>
              </Row>
              {cliente.horaEntrega && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                  Entregado: {new Date(cliente.horaEntrega).toLocaleTimeString()}
                </div>
              )}
            </Card>
          ))}

          {rutaActual.clientes?.every(c => c.entregado) && (
            <BFill
              onClick={finalizarRuta}
              style={{ width: '100%', padding: 14, marginTop: 8 }}
              disabled={saving}
            >
              {saving ? 'Finalizando...' : '✅ Finalizar ruta'}
            </BFill>
          )}
        </>
      )}

      {/* ========== VISTA: ENTREGA ========== */}
      {view === 'entrega' && clienteActual && (
        <Modal
          title={`📦 Entrega - ${clienteActual.nombre}`}
          onClose={() => setView('detalle')}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Dirección</div>
            <div style={{ fontSize: 14 }}>{clienteActual.domicilio || 'Sin dirección'}</div>
            {clienteActual.telefono && (
              <a href={`tel:${clienteActual.telefono}`} style={{ fontSize: 13, color: '#38bdf8' }}>
                📞 {clienteActual.telefono}
              </a>
            )}
          </div>

          <BFill
            onClick={() => setScanOpen(true)}
            style={{ width: '100%', marginBottom: 12, padding: 12 }}
          >
            📷 Escanear producto
          </BFill>

          {cart.length > 0 && (
            <Card>
              {cart.map(item => (
                <Row key={item.id} style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{item.nombre} x{item.cant}</span>
                  <span style={{ color: '#38bdf8', fontSize: 13 }}>{fmt(item.precio * item.cant)}</span>
                </Row>
              ))}
              <div style={{ borderTop: '1px solid #334155', paddingTop: 8, marginTop: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>
                    {fmt(cart.reduce((s, i) => s + i.precio * i.cant, 0))}
                  </span>
                </Row>
              </div>
            </Card>
          )}

          <div style={{ marginBottom: 12 }}>
            <Lbl>Forma de pago</Lbl>
            <select
              id="formaPagoEntrega"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '8px 10px',
                color: '#f1f5f9',
                fontSize: 13
              }}
            >
              <option value="contado">💵 Contado</option>
              <option value="credito">📋 Crédito</option>
            </select>
          </div>

          <Row style={{ gap: 8 }}>
            <BOut
              onClick={() => {
                setCart([]);
                setClienteActual(null);
                setView('detalle');
              }}
              style={{ flex: 1 }}
            >
              Cancelar
            </BOut>
            <BFill
              onClick={() => {
                const formaPago = document.getElementById('formaPagoEntrega').value;
                registrarEntrega(clienteActual.id, cart, formaPago);
              }}
              style={{ flex: 2 }}
              disabled={saving || cart.length === 0}
            >
              {saving ? 'Guardando...' : '✅ Confirmar entrega'}
            </BFill>
          </Row>
                  {scanOpen && (
            <BarcodeScanner
              onDetected={(code) => {
                const p = productos.find(x => x.codigoBarras === code);
                if (p) {
                  setCart(c => {
                    const ex = c.find(x => x.id === p.id);
                    return ex
                      ? c.map(x => x.id === p.id ? { ...x, cant: x.cant + 1 } : x)
                      : [...c, { id: p.id, nombre: p.nombre, precio: p.precio, cant: 1 }];
                  });
                  setScanOpen(false);
                } else {
                  alert('❌ Producto no encontrado');
                }
              }}
              onClose={() => setScanOpen(false)}
            />
          )}
        </Modal>
      )}

      {/* ========== VISTA: HISTORIAL ========== */}
      {view === 'historial' && (
        <Modal title="📋 Historial de rutas" onClose={() => setView('rutas')}>
          {rutas && rutas.length > 0 ? (
            rutas.map(r => (
              <Card key={r.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {fDate(r.fecha)}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {r.clientes?.length || 0} clientes · {r.entregas?.length || 0} entregas
                    </div>
                  </div>
                  <Tag color={r.estado === 'completada' ? '#22c55e' : '#f59e0b'}>
                    {r.estado || 'pendiente'}
                  </Tag>
                </Row>
                {r.repartidorNombre && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Repartidor: {r.repartidorNombre}
                  </div>
                )}
              </Card>
            ))
          ) : (
            <div style={{ textAlign: 'center', color: '#475569', padding: '20px 0' }}>
              Sin rutas registradas
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
// Registrar componente global
window.RutaRepartoAvanzado = RutaRepartoAvanzado;