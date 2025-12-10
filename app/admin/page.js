export default function AdminDashboardPage() {
    return (
        <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
                Dashboard Overview
            </h1>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1.5rem'
            }}>
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ color: 'var(--secondary)', marginBottom: '0.5rem' }}>Total Users</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>--</p>
                </div>

                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ color: 'var(--secondary)', marginBottom: '0.5rem' }}>Active Sessoins</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>--</p>
                </div>

                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ color: 'var(--secondary)', marginBottom: '0.5rem' }}>Pending Requests</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>--</p>
                </div>
            </div>

            <div style={{ marginTop: '3rem', padding: '2rem', borderRadius: '1rem' }} className="glass">
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>System Status</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }}></div>
                    <span>Operational</span>
                </div>
            </div>
        </div>
    );
}
