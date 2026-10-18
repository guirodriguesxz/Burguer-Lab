import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { ReportsService } from './reports.service'

@Module({ controllers: [AdminController], providers: [ReportsService] })
export class AdminModule {}
