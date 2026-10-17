import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { RegisterWorkerSchema, WorkerHeartbeatSchema } from '@gmail-manager/contracts';
import { PrismaService } from '../../infrastructure/prisma.service';
import { parseInput } from '../../common/zod';

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  async register(raw: unknown) {
    const input = parseInput(RegisterWorkerSchema, raw);
    const deviceName = `Chrome Worker ${input.profileIdentifier.slice(0, 8)}`;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const worker = await this.prisma.worker.upsert({
      where: { profileIdentifier: input.profileIdentifier },
      create: { ...input, deviceName, tokenHash, lastHeartbeatAt: new Date() },
      update: {
        deviceName,
        extensionVersion: input.extensionVersion,
        tokenHash,
        isEnabled: true,
      },
      select: { id: true, deviceName: true, profileIdentifier: true, status: true },
    });
    return { ...worker, workerToken: token };
  }

  heartbeat(workerId: string, raw: unknown) {
    const input = parseInput(WorkerHeartbeatSchema, raw);
    return this.prisma.worker.update({
      where: { id: workerId },
      data: {
        status: input.status,
        currentTaskId: input.currentTaskId,
        lastHeartbeatAt: new Date(),
      },
      select: { id: true, status: true, currentTaskId: true, lastHeartbeatAt: true },
    });
  }

  get(workerId: string) {
    return this.prisma.worker.findUniqueOrThrow({
      where: { id: workerId },
      select: {
        id: true,
        deviceName: true,
        profileIdentifier: true,
        extensionVersion: true,
        status: true,
        currentTaskId: true,
        lastHeartbeatAt: true,
      },
    });
  }

  list() {
    return this.prisma.worker.findMany({
      select: {
        id: true,
        deviceName: true,
        profileIdentifier: true,
        extensionVersion: true,
        status: true,
        isEnabled: true,
        currentTaskId: true,
        lastHeartbeatAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  disable(id: string) {
    return this.prisma.worker.update({
      where: { id },
      data: { isEnabled: false, status: 'OFFLINE' },
      select: { id: true, isEnabled: true },
    });
  }
}
