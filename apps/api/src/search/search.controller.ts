import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { SearchService } from './search.service';

@Controller('api/search')
@UseGuards(JwtGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  searchGlobal(@Query('q') q?: string) {
    return this.search.search(q ?? '');
  }
}
