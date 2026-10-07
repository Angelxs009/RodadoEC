import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import {
  CreateUserAdminDto, USER_ROLES, UserAdminResponseDto, type UserRole,
} from './dto/user-admin.dto';

/**
 * Gestión de usuarios (administradores y clientes) desde el backoffice.
 * Es la única parte de /admin protegida con token: crear cuentas de administrador
 * sin autenticarse sería una escalada de privilegios abierta a cualquiera.
 * Token: POST /admin/auth/login → "Authorize".
 */
@Controller('admin/users')
@ApiTags('Administración')
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (administradores y clientes)' })
  @ApiResponse({ status: 200, type: [UserAdminResponseDto] })
  list() {
    return this.usersService.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un usuario administrador o cliente',
    description:
      'role=ADMIN requiere username + password. role=CUSTOMER requiere email, password, first_name y last_name. La cuenta creada puede iniciar sesión de inmediato.',
  })
  @ApiResponse({ status: 201, type: UserAdminResponseDto })
  @ApiResponse({ status: 409, description: 'Username o correo ya registrado' })
  create(@Body() dto: CreateUserAdminDto) {
    return this.usersService.create(dto);
  }

  @Delete(':role/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiParam({ name: 'role', enum: USER_ROLES })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(
    @Param('role', new ParseEnumPipe(USER_ROLES)) role: UserRole,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.remove(role, id);
  }
}
