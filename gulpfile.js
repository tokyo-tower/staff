var gulp = require('gulp');
var plumber = require('gulp-plumber');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var autoPrefixer = require('gulp-autoprefixer');
var cssComb = require('gulp-csscomb');
var cssnano = require('gulp-cssnano');
var mmq = require('gulp-merge-media-queries');

var dir_src = './public';
var dir_dst = './public';

gulp.task('sass',function(){
	gulp.src([
		dir_src+'/scss/___**.scss',
		dir_src+'/scss/__*.scss',
		dir_src+'/scss/_*.scss',
		dir_src+'/scss/**/*.scss',
		'!'+dir_src+'/scss/print/*.scss'
	])
	.pipe(plumber({
		handleError: function (err) {
			console.log(err);
			this.emit('end');
		}
	}))
	.pipe(concat('style.scss'))
	.pipe(sass())
	.pipe(autoPrefixer())
	.pipe(cssComb())
	.pipe(mmq())
	.pipe(cssnano())
	.pipe(gulp.dest(dir_dst+'/css'))
	gulp.src([
		dir_src+'/scss/__reset.scss',
		dir_src+'/scss/print/*.scss'
	])
	.pipe(plumber({
		handleError: function (err) {
			console.log(err);
			this.emit('end');
		}
	}))
	.pipe(concat('print.scss'))
	.pipe(sass())
	.pipe(autoPrefixer())
	.pipe(cssComb())
	.pipe(mmq())
	.pipe(cssnano())
	.pipe(gulp.dest(dir_dst+'/css'))
});

gulp.task('default',['sass'],function(){
	gulp.watch(dir_src+'/scss/**/*.scss',['sass']);
});

