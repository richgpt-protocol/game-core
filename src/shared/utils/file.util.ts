import { extname } from 'path';
import * as compress_images from 'compress-images';
import { BadRequestException } from '@nestjs/common';

export class FileUtil {
  public static fileFilter(file: any) {
    if (!file.originalname.match(/\.(pdf)$/)) {
      return false;
    }
    return true;
  }

  public static imageFileFilter(file: any, caseSensitive: boolean = true) {
    let fileName = file.originalname;
    if (!caseSensitive) {
      fileName = fileName.toLowerCase();
    }
    if (!fileName.match(/\.(jpg|jpeg|png|gif)$/)) {
      return false;
    }
    return true;
  }

  public static editFileName(req, file, callback) {
    const name = file.originalname.split('.')[0];
    const fileExtName = extname(file.originalname);
    const randomName = Array(4)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');
    callback(null, `${name}-${randomName}${fileExtName}`);
  }

  public static imageFileFilterReq(req, file: any, callback) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return callback(
        new BadRequestException('Only image files are allowed!'),
        false,
      );
    }
    callback(null, true);
  }

  /**
   *
   * @param filePath Example: src/img/*.{jpg,JPG,jpeg,JPEG,png,svg,gif}
   */
  public static async compressImage(filePath: string, callback: any) {
    return new Promise((resolve) => {
      const outputPath = 'build/img/';
      compress_images(
        filePath,
        outputPath,
        {
          commpress_force: false,
          statistic: true,
          autoupdate: true,
        },
        false,
        { jpg: { engine: 'mozjpeg', command: ['-quality', '60'] } },
        { png: { engine: 'pngquant', command: ['--quality=20-50', '-o'] } },
        { svg: { engine: 'svgo', command: '--multipass' } },
        {
          gif: {
            engine: 'gifsicle',
            command: ['--colors', '64', '--use-col=web'],
          },
        },
        async (error, completed, statistic) => {
          if (completed) {
            if (error) {
              await callback({
                status: false,
                error,
              });
            }

            await callback({
              status: true,
              path: statistic.path_out_new,
            });
          } else {
            await callback({
              status: false,
            });
          }

          resolve(null);
        },
      );
    });
  }
}
