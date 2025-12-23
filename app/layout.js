

import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

import { NotificationProvider } from '@/contexts/NotificationContext';
import NotificationSystem from '@/components/NotificationSystem';
import { Inter, Outfit } from 'next/font/google'; // Added missing imports for Inter and Outfit

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });

export const metadata = {
    title: 'Realty Photo Enhancement',
    description: 'Bulk enhance real estate photos with AI',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={`${inter.variable} ${outfit.variable} antialiased`} suppressHydrationWarning={true}>
                <AuthProvider> {/* AuthProvider is still here, as the instruction was to wrap children with NotificationProvider, not replace AuthProvider. The provided snippet was a bit ambiguous on this. */}
                    <NotificationProvider>
                        {children}
                        <NotificationSystem />
                    </NotificationProvider>
                </AuthProvider>
            </body>
        </html>
    );
}

