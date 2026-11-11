import { PasswordService } from '../../apps/identity/src/password.service';

describe('PasswordService', () => {
  const s = new PasswordService();
  it('el hash tiene formato salt:hash y no contiene la contraseña', () => {
    const h = s.hash('secreta123');
    expect(h).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(h).not.toContain('secreta123');
  });
  it('verifica la contraseña correcta y rechaza la incorrecta', () => {
    const h = s.hash('secreta123');
    expect(s.verify('secreta123', h)).toBe(true);
    expect(s.verify('otra', h)).toBe(false);
  });
  it('dos hashes de la misma contraseña difieren (salt aleatorio)', () => {
    expect(s.hash('a')).not.toBe(s.hash('a'));
  });
  it('un hash malformado no verifica', () => {
    expect(s.verify('a', '')).toBe(false);
    expect(s.verify('a', 'sinseparador')).toBe(false);
  });
});
