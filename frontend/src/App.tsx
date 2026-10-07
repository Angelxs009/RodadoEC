import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { RequireAdminAuth } from './components/RequireAdminAuth';
import { RequireCustomerAuth } from './components/RequireCustomerAuth';
import { ScrollToTop } from './components/ScrollToTop';
import { BookingProvider } from './lib/booking-context';
import { CustomerAuthProvider } from './lib/customer-auth-context';
import { AccountLoginPage } from './pages/account/AccountLoginPage';
import { AccountRegisterPage } from './pages/account/AccountRegisterPage';
import { MyAccountPage } from './pages/account/MyAccountPage';
import { AdminDepotsPage } from './pages/admin/AdminDepotsPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminVehiclesPage } from './pages/admin/AdminVehiclesPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ResultsPage } from './pages/ResultsPage';
import { SearchPage } from './pages/SearchPage';
import { VehicleDetailPage } from './pages/VehicleDetailPage';
import { WebhooksPage } from './pages/WebhooksPage';

function App() {
  return (
    <CustomerAuthProvider>
      <BookingProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Layout>
            <Routes>
              <Route path="/" element={<SearchPage />} />
              <Route path="/resultados" element={<ResultsPage />} />
              <Route path="/auto/:vehicleId" element={<VehicleDetailPage />} />
              <Route
                path="/checkout"
                element={
                  <RequireCustomerAuth>
                    <CheckoutPage />
                  </RequireCustomerAuth>
                }
              />
              <Route path="/orden/:orderId" element={<ConfirmationPage />} />

              <Route path="/cuenta/login" element={<AccountLoginPage />} />
              <Route path="/cuenta/registro" element={<AccountRegisterPage />} />
              <Route
                path="/cuenta"
                element={
                  <RequireCustomerAuth>
                    <MyAccountPage />
                  </RequireCustomerAuth>
                }
              />

              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route
                path="/admin"
                element={
                  <RequireAdminAuth>
                    <AdminLayout>
                      <AdminVehiclesPage />
                    </AdminLayout>
                  </RequireAdminAuth>
                }
              />
              <Route
                path="/admin/depots"
                element={
                  <RequireAdminAuth>
                    <AdminLayout>
                      <AdminDepotsPage />
                    </AdminLayout>
                  </RequireAdminAuth>
                }
              />
              <Route
                path="/admin/orders"
                element={
                  <RequireAdminAuth>
                    <AdminLayout>
                      <AdminOrdersPage />
                    </AdminLayout>
                  </RequireAdminAuth>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequireAdminAuth>
                    <AdminLayout>
                      <AdminUsersPage />
                    </AdminLayout>
                  </RequireAdminAuth>
                }
              />
              <Route
                path="/admin/webhooks"
                element={
                  <RequireAdminAuth>
                    <AdminLayout>
                      <WebhooksPage />
                    </AdminLayout>
                  </RequireAdminAuth>
                }
              />
            </Routes>
          </Layout>
        </BrowserRouter>
      </BookingProvider>
    </CustomerAuthProvider>
  );
}

export default App;
