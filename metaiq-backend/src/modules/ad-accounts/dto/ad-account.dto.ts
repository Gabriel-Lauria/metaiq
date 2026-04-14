import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateAdAccountDto {
  @IsString()
  @Length(1, 100)
  metaId: string;

  @IsString()
  @Length(1, 200)
  name: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class UpdateAdAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
