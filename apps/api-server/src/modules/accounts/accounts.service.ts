import { Injectable } from '@nestjs/common';
import {
  AccountCreateInputSchema,
  AccountInputSchema,
  type AccountInput,
} from '@gmail-manager/contracts';
import { PrismaService } from '../../infrastructure/prisma.service';
import { parseInput } from '../../common/zod';
import { generateRandomAccount } from './random-account';

const publicSelect = {
  id: true,
  firstName: true,
  lastName: true,
  birthday: true,
  gender: true,
  desiredUsername: true,
  phoneReference: true,
  recoveryEmail: true,
  consentStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.account.findMany({ select: publicSelect, orderBy: { createdAt: 'desc' } });
  }

  get(id: string) {
    return this.prisma.account.findUniqueOrThrow({
      where: { id },
      select: { ...publicSelect, tasks: { select: { id: true, status: true, createdAt: true } } },
    });
  }

  create(raw: unknown) {
    const { phoneReference } = parseInput(AccountCreateInputSchema, raw);
    const input = generateRandomAccount(phoneReference);
    return this.prisma.account.create({ data: this.toData(input), select: publicSelect });
  }

  async update(id: string, raw: unknown) {
    const input = parseInput(AccountInputSchema.partial(), raw);
    const { birthday, ...rest } = input;
    return this.prisma.account.update({
      where: { id },
      data: { ...rest, birthday: birthday ? new Date(birthday) : undefined },
      select: publicSelect,
    });
  }

  async remove(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const tasks = await tx.task.findMany({
        where: { accountId: id },
        select: { id: true },
      });
      const taskIds = tasks.map((task) => task.id);
      if (taskIds.length) {
        await tx.worker.updateMany({
          where: { currentTaskId: { in: taskIds } },
          data: { currentTaskId: null, status: 'IDLE' },
        });
      }
      await tx.task.deleteMany({ where: { accountId: id } });
      await tx.account.delete({ where: { id } });
    });
    return { id };
  }

  private toData(input: AccountInput) {
    return {
      firstName: input.firstName,
      lastName: input.lastName,
      birthday: input.birthday,
      gender: input.gender,
      desiredUsername: input.desiredUsername,
      password: input.password,
      phoneReference: input.phoneReference,
      recoveryEmail: input.recoveryEmail || null,
      consentStatus: input.consentStatus,
    };
  }
}
