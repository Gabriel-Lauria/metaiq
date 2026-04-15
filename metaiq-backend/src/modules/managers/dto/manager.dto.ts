import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateManagerDto {
  @IsString()
  @MinLength(2)
  name: string;
}

export class UpdateManagerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
