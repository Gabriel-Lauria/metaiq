import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MinLength } from 'class-validator';
import { AccountType } from '../../../common/enums';

export class LoginDto {
  @IsEmail({}, { message: 'Email deve ser válido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString({ message: 'Senha deve ser uma string' })
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
  password: string;
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString({ message: 'Refresh token deve ser uma string' })
  @IsNotEmpty({ message: 'Refresh token é obrigatório' })
  refreshToken?: string;
}

export class RegisterDto {
  @IsEmail({}, { message: 'Email deve ser válido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString({ message: 'Senha deve ser uma string' })
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
  password: string;

  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsOptional()
  @IsEnum(AccountType, { message: 'accountType deve ser AGENCY ou INDIVIDUAL' })
  accountType?: AccountType;

  @IsString({ message: 'businessName deve ser uma string' })
  @IsNotEmpty({ message: 'businessName é obrigatório' })
  businessName: string;

  @IsOptional()
  @IsString({ message: 'businessSegment deve ser uma string' })
  businessSegment?: string;

  @IsOptional()
  @IsString({ message: 'city deve ser uma string' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'state deve ser uma string' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'defaultCity deve ser uma string' })
  defaultCity?: string;

  @IsOptional()
  @IsString({ message: 'defaultState deve ser uma string' })
  defaultState?: string;

  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'website deve ser uma URL válida com https://' },
  )
  @Matches(/^https:\/\//i, { message: 'website deve começar com https://' })
  website?: string;

  @IsOptional()
  @Matches(/^@?[a-zA-Z0-9._]{1,80}$/, {
    message: 'instagram deve ser um handle válido',
  })
  instagram?: string;

  @IsOptional()
  @Matches(/^[0-9+\-().\s]{8,32}$/, {
    message: 'whatsapp deve ser um telefone válido',
  })
  whatsapp?: string;
}
