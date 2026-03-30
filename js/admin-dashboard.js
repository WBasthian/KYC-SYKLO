function renderSanctions(sanctions) {
  const list = document.getElementById('sanctions-list');
  if (!list) return;
  list.innerHTML = sanctions.length ? '' : '<p class="notes-empty">Sin historial de sanciones.</p>';
  
  const now = new Date();

  sanctions.slice().reverse().forEach(s => {
    // Comprobar si esta sanción específica sigue activa
    const isActive = new Date(s.expiresAt) > now;
    
    // Cambiar estilos dinámicamente
    const bg = isActive ? 'var(--clr-danger-dim)' : 'rgba(255,255,255,0.04)';
    const border = isActive ? 'rgba(239,68,68,0.3)' : 'var(--clr-border)';
    const icon = isActive ? '⚠' : '✓';
    const opacity = isActive ? '1' : '0.6';
    const statusLabel = isActive ? '' : '<span style="font-size: 0.65rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-left: 8px;">EXPIRADA</span>';

    list.innerHTML += `
      <div class="sanction-item" style="background: ${bg}; border: 1px solid ${border}; opacity: ${opacity};">
        <div class="sanction-item__reason">${icon} ${s.reason} ${statusLabel}</div>
        <div class="sanction-item__meta">
          ${s.days} días · Por: ${s.appliedBy} 
          ${s.evidenceURL ? `· <a href="${s.evidenceURL}" target="_blank" style="text-decoration: underline;">Ver prueba</a>` : ''}
        </div>
      </div>`;
  });
}
