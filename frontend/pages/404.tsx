export default function Page404() {
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div style={{textAlign:'center'}}>
        <h1 style={{fontSize:'2rem',fontWeight:700,marginBottom:'8px'}}>Página no encontrada</h1>
        <p style={{color:'#6b7280',marginBottom:'16px'}}>La ruta que intentaste abrir no existe.</p>
        <a href="/" style={{display:'inline-flex',alignItems:'center',borderRadius:'8px',background:'#3b82f6',color:'#fff',padding:'8px 16px',textDecoration:'none'}}>Volver al inicio</a>
      </div>
    </div>
  );
}