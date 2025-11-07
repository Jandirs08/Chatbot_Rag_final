export default function Page500() {
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div style={{textAlign:'center'}}>
        <h1 style={{fontSize:'2rem',fontWeight:700,marginBottom:'8px'}}>Error del servidor</h1>
        <p style={{color:'#6b7280',marginBottom:'16px'}}>Ocurrió un error inesperado. Intenta nuevamente.</p>
        <a href="/" style={{display:'inline-flex',alignItems:'center',borderRadius:'8px',background:'#3b82f6',color:'#fff',padding:'8px 16px',textDecoration:'none'}}>Volver al inicio</a>
      </div>
    </div>
  );
}