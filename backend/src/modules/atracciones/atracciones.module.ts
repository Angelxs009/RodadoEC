import { Module } from '@nestjs/common';
import { AtraccionesService } from './atracciones.service';
import { AtraccionesController } from './atracciones.controller';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [AtraccionesController],
  providers: [AtraccionesService],
})
export class AtraccionesModule {}
