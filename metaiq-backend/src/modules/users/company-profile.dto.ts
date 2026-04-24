import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class UpdateMyCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessSegment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Matches(/^[a-zA-Z]{2}$/, { message: 'defaultState deve conter uma UF válida com 2 letras' })
  defaultState?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'website deve ser uma URL válida com http:// ou https://' })
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^@?[a-zA-Z0-9._]{1,80}$/, {
    message: 'instagram deve ser um handle válido',
  })
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9+\-().\s]{8,32}$/, {
    message: 'whatsapp deve ser um telefone válido',
  })
  whatsapp?: string;
}
