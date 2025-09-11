import { Button } from "@leadcrm/ui/button";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>📚 LeadsAgent Documentation</h1>
          <p className={styles.subtitle}>
            Comprehensive documentation for the LeadsAgent CRM system with WhatsApp automation
          </p>
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <h2>🚀 API Documentation</h2>
            <p>Complete API reference with interactive endpoints and examples.</p>
            <a 
              href="http://localhost:3001/api/docs" 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.primary}
            >
              View Swagger API Docs
            </a>
          </div>

          <div className={styles.card}>
            <h2>📱 Dashboard</h2>
            <p>Access the main application dashboard for managing leads and campaigns.</p>
            <a 
              href="http://localhost:3000" 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.secondary}
            >
              Open Dashboard
            </a>
          </div>

          <div className={styles.card}>
            <h2>💬 WhatsApp Service</h2>
            <p>WhatsApp integration service for automated messaging and lead capture.</p>
            <a 
              href="http://localhost:3002/api" 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.secondary}
            >
              WhatsApp API
            </a>
          </div>

          <div className={styles.card}>
            <h2>📊 Services Overview</h2>
            <div className={styles.servicesList}>
              <div className={styles.service}>
                <strong>Dashboard</strong> - http://localhost:3000
              </div>
              <div className={styles.service}>
                <strong>API</strong> - http://localhost:3001
              </div>
              <div className={styles.service}>
                <strong>WhatsApp Service</strong> - http://localhost:3002
              </div>
              <div className={styles.service}>
                <strong>Docs</strong> - http://localhost:3003
              </div>
            </div>
          </div>
        </div>

        <div className={styles.features}>
          <h2>✨ Key Features</h2>
          <ul className={styles.featuresList}>
            <li>📈 Lead management and tracking</li>
            <li>🤖 AI-powered lead qualification</li>
            <li>📱 WhatsApp integration</li>
            <li>🔄 Campaign automation</li>
            <li>📊 Analytics and reporting</li>
            <li>🔐 Secure authentication with Clerk</li>
          </ul>
        </div>
      </main>
      <footer className={styles.footer}>
        <div>LeadsAgent CRM v1.0 - AI-Powered Lead Management</div>
      </footer>
    </div>
  );
}
