import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) { }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: '유저 목록 조회 (ADMIN 전용)' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
    @ApiQuery({ name: 'sort', required: false, type: String, example: 'createdAt' })
    @ApiQuery({ name: 'order', required: false, type: String, example: 'DESC' })
    @ApiResponse({ status: 200, description: '유저 목록', type: [User] })
    async findAll(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
        @Query('sort') sort = 'createdAt',
        @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    ) {
        const pageNum = Number(page) || 1;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (pageNum - 1) * take;
        const orderBy = ['id', 'username', 'createdAt', 'updatedAt', 'role'].includes(sort) ? sort : 'createdAt';
        const orderDir = order === 'ASC' ? 'ASC' : 'DESC';

        const [items, total] = await this.usersRepository.findAndCount({
            order: { [orderBy]: orderDir },
            skip,
            take,
        });

        return {
            total,
            page: pageNum,
            limit: take,
            items,
        };
    }
}

