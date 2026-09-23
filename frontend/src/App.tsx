import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { ScrollToTop } from './components/ScrollToTop';
import { BookingProvider } from './lib/booking-context';
import { AdminDepotsPage } from './pages/admin/AdminDepotsPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminVehiclesPage } from './pages/admin/AdminVehiclesPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ResultsPage } from './pages/ResultsPage';
import { SearchPage } from './pages/SearchPage';
import { VehicleDetailPage } from './pages/VehicleDetailPage';
import { WebhooksPage } from './pages/WebhooksPage';

function App() {
  return (
    <BookingProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Layout>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/resultados" element={<ResultsPage />} />
            <Route path="/auto/:vehicleId" element={<VehicleDetailPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orden/:orderId" element={<ConfirmationPage />} />
            <Route path="/webhooks" element={<WebhooksPage />} />
            <Route
              path="/admin"
              element={
                <AdminLayout>
                  <AdminVehiclesPage />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/depots"
              element={
                <AdminLayout>
                  <AdminDepotsPage />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/orders"
              element={
                <AdminLayout>
                  <AdminOrdersPage />
                </AdminLayout>
              }
            />
          </Routes>
        </Layout>
      </BrowserRouter>
    </BookingProvider>
  );
}

export default App;
