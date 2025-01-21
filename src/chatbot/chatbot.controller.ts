import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Secure } from 'src/shared/decorators/secure.decorator';
import { UserRole } from 'src/shared/enum/role.enum';
import { ErrorResponseVo, ResponseVo } from 'src/shared/vo/response.vo';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './dto/sendMessage.dto';

@ApiTags('Chatbot')
@Controller('api/v1/chatbot')
export class ChatbotController {
  private readonly logger = new Logger(ChatbotController.name);

  constructor(private chatbotService: ChatbotService) {}

  @Secure(null, UserRole.USER)
  @Post('send')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async sendMessage(
    @Request() req,
    @Body() payload: SendMessageDto,
  ): Promise<ResponseVo<any>> {
    try {
      const replied = await this.chatbotService.sendMessage(
        req.user.userId,
        payload,
      );
      return {
        statusCode: HttpStatus.OK,
        data: {
          replied: replied,
        },
        message: '',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: {},
        message: 'internal server error',
      };
    }
  }

  @Secure(null, UserRole.USER)
  @Get('historical-message')
  @ApiHeader({
    name: 'x-custom-lang',
    description: 'Custom Language',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OK',
    type: ResponseVo,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bad Request',
    type: ErrorResponseVo,
  })
  async getHistoricalMessage(
    @Request() req,
    @Query('limit') limit: number,
  ): Promise<ResponseVo<any>> {
    try {
      const historicalMessage = await this.chatbotService.getHistoricalMessage(
        req.user.userId,
        limit,
      );
      return {
        statusCode: HttpStatus.OK,
        data: {
          historicalMessage: historicalMessage.reverse(),
        },
        message: '',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: {},
        message: 'internal server error',
      };
    }
  }
}
