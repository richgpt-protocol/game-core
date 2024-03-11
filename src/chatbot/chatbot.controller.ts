import {
    Body,
    Controller,
    HttpStatus,
    Post,
    Request,
  } from '@nestjs/common';
  import { ApiHeader, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
  import { Secure } from 'src/shared/decorators/secure.decorator';
  import { UserRole } from 'src/shared/enum/role.enum';
  import {
    ErrorResponseVo,
    ResponseVo,
  } from 'src/shared/vo/response.vo';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './dto/sendMessage.dto';

@ApiTags('Chatbot')
@Controller('api/v1/chatbot')
export class ChatbotController {
  constructor(
    private chatbotService: ChatbotService,
  ) {}

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
    @Body() payload: SendMessageDto
  ): Promise<ResponseVo<any>> {
    try {
      const replied = await this.chatbotService.sendMessage(req.user.userId, payload)
      return {
        statusCode: HttpStatus.OK,
        data: {
          replied: replied
        },
        message: '',
      };

    } catch (error) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: {},
        message: error,
      };
    }
  }
}
