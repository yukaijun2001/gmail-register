import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentWorker } from './current-worker.decorator';
import { WorkerGuard } from './worker-auth.guard';
import { WorkersService } from './workers.service';

@ApiTags('workers')
@Controller('workers')
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Post('register')
  register(@Body() body: unknown) {
    return this.workers.register(body);
  }

  @Post('heartbeat')
  @UseGuards(WorkerGuard)
  heartbeat(@CurrentWorker() worker: { id: string }, @Body() body: unknown) {
    return this.workers.heartbeat(worker.id, body);
  }

  @Get('me')
  @UseGuards(WorkerGuard)
  me(@CurrentWorker() worker: { id: string }) {
    return this.workers.get(worker.id);
  }
}

@ApiTags('admin/workers')
@Controller('admin/workers')
export class AdminWorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get()
  list() {
    return this.workers.list();
  }

  @Post(':id/disable')
  disable(@Param('id') id: string) {
    return this.workers.disable(id);
  }
}
