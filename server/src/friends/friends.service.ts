import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friend, FriendStatus } from './friend.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friend)
    private friendRepository: Repository<Friend>,
    private usersService: UsersService,
  ) {}

  async sendRequest(requesterId: number, receiverUsername: string) {
    const requester = await this.usersService.findById(requesterId);
    const receiver = await this.usersService.findOne(receiverUsername);
    if (!receiver) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    if (!requester) {
      throw new NotFoundException('요청자를 찾을 수 없습니다.');
    }
    if (requester.id === receiver.id) {
      throw new BadRequestException('본인에게 친구 요청을 보낼 수 없습니다.');
    }

    const existing = await this.friendRepository.findOne({
      where: [
        { requester, receiver },
        { requester: receiver, receiver: requester },
      ],
    });
    if (existing) {
      throw new BadRequestException('이미 친구 요청이 존재합니다.');
    }

    const entity = this.friendRepository.create({
      requester,
      receiver,
      status: FriendStatus.PENDING,
    });
    return this.friendRepository.save(entity);
  }

  async respondRequest(
    requestId: number,
    userId: number,
    action: 'accept' | 'block',
  ) {
    const request = await this.friendRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('요청을 찾을 수 없습니다.');
    }
    if (request.receiver.id !== userId) {
      throw new BadRequestException('승인/차단 권한이 없습니다.');
    }
    request.status =
      action === 'accept' ? FriendStatus.ACCEPTED : FriendStatus.BLOCKED;
    return this.friendRepository.save(request);
  }

  async listFriends(userId: number) {
    const list = await this.friendRepository.find({
      where: [
        { requester: { id: userId }, status: FriendStatus.ACCEPTED },
        { receiver: { id: userId }, status: FriendStatus.ACCEPTED },
      ],
    });

    const toPublic = (f: Friend): { id: number; friend: User } => {
      const friendUser = f.requester.id === userId ? f.receiver : f.requester;
      return { id: f.id, friend: friendUser };
    };

    return list.map(toPublic);
  }

  async listPending(userId: number) {
    return this.friendRepository.find({
      where: [{ receiver: { id: userId }, status: FriendStatus.PENDING }],
    });
  }
}
