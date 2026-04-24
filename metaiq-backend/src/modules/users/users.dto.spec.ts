import { ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';
import { AdminUpdateUserDto } from './users.service';
import { UpdateMyCompanyDto } from './company-profile.dto';

describe('AdminUpdateUserDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: AdminUpdateUserDto,
    data: '',
  };

  it('rejects accountType coming from the client payload', async () => {
    await expect(
      pipe.transform({
        name: 'Novo nome',
        accountType: 'INDIVIDUAL',
      }, metadata),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining(['property accountType should not exist']),
      },
    });
  });
});

describe('UpdateMyCompanyDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateMyCompanyDto,
    data: '',
  };

  it('rejects accountType in payload', async () => {
    await expect(
      pipe.transform({
        businessName: 'Minha empresa',
        accountType: 'INDIVIDUAL',
      }, metadata),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining(['property accountType should not exist']),
      },
    });
  });

  it('rejects invalid website', async () => {
    await expect(
      pipe.transform({
        website: 'metaiq.dev',
      }, metadata),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining(['website deve ser uma URL válida com http:// ou https://']),
      },
    });
  });

  it('rejects invalid instagram handle', async () => {
    await expect(
      pipe.transform({
        instagram: 'perfil com espaco',
      }, metadata),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining(['instagram deve ser um handle válido']),
      },
    });
  });

  it('rejects invalid whatsapp', async () => {
    await expect(
      pipe.transform({
        whatsapp: 'abc',
      }, metadata),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining(['whatsapp deve ser um telefone válido']),
      },
    });
  });
});
