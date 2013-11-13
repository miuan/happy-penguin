var fs = require('fs'),
    words = require('./words.js'),
    Image = require('./image.js'),
    Async = require('async'),
    Config = require('../config/local.js'),
    Archiver = require('archiver');

/*
    PKG_DIR = '/tmp/pkg/' in config
 */

module.exports.DIR_LANG = 'lang/';
module.exports.DIR_IMG = 'img/';

module.exports.LANG_EXT = '.data';

module.exports.getPackageForUpdate = function(pg, timeFrom, cb){
    var sql = 'SELECT changed, lesson, lang_mask FROM update_package ' +
        'WHERE lesson IS NOT NULL AND changed > $1';

    var sqlvar = [timeFrom];
    console.log(sql, sqlvar);
    loadLangs(pg, function(err, langs){

        if(err){
            cb(err, langs);
            return ;
        }


        console.log('getPackageForUpdate', langs);

        pg.query(sql, sqlvar, function(err, update_packages){
            if(err){
                cb(err);
                return;
            }

            update_packages.rows.forEach(function(val){
                val.langs = getLanguagesFromMask(val.lang_mask, langs)
            });

            cb(err, update_packages.rows);
        });
    })

}

/**
 *
 * @param generateData = {
 *    outDir : '/tmp/',
 *    lesson : 102,
 *    lang ; 'cs',
 *    words : [ list..of..words ]
 *    images : [ list..of..images ]
 * }
 *
 * @param cb - callback
 *
 *
 * FORMAT:
 * lesson;lang;num_words
 * lid1;word1;*img1
 * lid2;word2;*img2
 * lid3;word3;*img3
 */

module.exports.generateLangFile = function(generateData, cb){
    var file = generateData.outDir + module.exports.DIR_LANG + generateData.lang + module.exports.LANG_EXT;
    //words.getWords(pg, lang, lesson, function(words){
        var data = generateData.lesson + ';'
            + generateData.lang
            + ';' + generateData.words.length
            + '\n';

        generateData.words.forEach(function(w,idx){
           data += w.link + ";";
           data += w.word + ";";

           generateData.images.some(function(image,ii){
               if(w.link == image.lid){

                   if(image.imagefile){
                       data += image.imagefile;
                   }


                   return;
               }
           });

           data += "\n";
        });

        //console.log('to tech dat moc neni ne?', data, file);
        fs.writeFile(file, data, function (err) {
           cb(err);
        });

    //});
}

/**
 *
 * @param copyImgData = {
 *    outDir : '/tmp/',
 *    images : [ list..of..images ]
 * }
 *
 * @param cb - callback
 *
 */

module.exports.copyImageFiles = function(copyImgData, cb){
    var copies = [];
    var files = [];
    copyImgData.images.forEach(function(image, idx)
    {
        if(image.imagefile){
            var img = image.imagefile;
            var cp = function(icb){

                var orig = Image.IMG_THUMB_DIR + img;
                var desc = copyImgData.outDir + module.exports.DIR_IMG + img;

                copyFile(orig, desc, icb);
            }

            copies.push(cp);
            files.push(img);
        }
    });

    // changed to parallel task with copy file
    // because afterEach was error with can't read file
    // randomly in source
    Async.parallel(copies, function(err){
        cb(err, err ? null : files);
    });
}





module.exports.createPackage = function(pg, lesson, cb){
    var temp = new Date().getTime();
    var tempDir = Config.DIR_TMP + temp + '/';
    var fileName = lesson + '_'  + temp + '.lng';


    var sqlLang = 'SELECT code as lang FROM t_lang';
    pg.query(sqlLang, function(err, langData){
        var langs = [];

        langData.rows.forEach(function(lang){
            langs.push(lang.lang);
        });

        module.exports.createPkgDirectory(tempDir, function(err){

        words.getWordsWithImages(pg, langs, lesson, function(err, words){
            var images = words[words.length-1];
            //console.log(words);
            var asyncFuncs = [];

            // the images are in end of words list
            // but in async list have to be first
            // because zip package expecting in data list of images
            asyncFuncs.push(function(icb){
                    module.exports.copyImageFiles({
                        outDir : tempDir,
                        images : images
                    }, function(err, copiedFiles){
                        icb(err, copiedFiles);
               });
            });

            // but if i put to for the lang is allways the last value in list
            // for exaple list : ['ar','cs', 'ms'] ->
            // in funciton(icb) the generalData -> allways 'ms'
            function not_nice_solution(idx, fnc){
                var generateData = {
                    outDir : tempDir,
                    lesson : lesson,
                    lang : langs[idx2],
                    words : words[idx2],
                    images : images,
                    fileName : fileName
                };
                return function(icb){
                    fnc(generateData, function(err){
                        icb(err);
                    },
                        // not nice solution in not nice solution -> bat solution
                        pg);
                }
            }

            for(var idx2 = 0; idx2 != words.length - 1; idx2++){
                asyncFuncs.push(not_nice_solution(idx2, module.exports.generateLangFile));
                asyncFuncs.push(not_nice_solution(idx2, storeInDbPackage));
            }

            Async.parallel(asyncFuncs, function(err, data){
                if(err){
                    cb(err);
                } else {
                    zipPackage(tempDir + fileName, tempDir, langs, data[0], cb);
                }
            });

        });
        }); // module.exports.createPkgDirectory(tempDir, function(err)
    });

}

function storeInDbPackage(generateData, cb, pg){
    var thumb = generateData.words.slice(1,10);
    console.log('generateData.words.slice(1,30)',generateData, generateData.words, thumb);

    var wordsArray = [];
    generateData.words.forEach(function(w){
        wordsArray.push(w.word);
    });

    var words = wordsArray.join().substr(0, 255);

    var sql = 'UPDATE package_t SET examples=$1, file=$2 WHERE lesson=$3 AND lang=$4';
    var sqlval = [words, generateData.fileName, generateData.lesson, generateData.lang];
    pg.query(sql, sqlval, function(err, update){
        console.log('storeInDbPackage', sql, sqlval, update.rowCount);

        if(update.rowCount < 1){
            sql = 'INSERT INTO package_t (examples, file, lesson, lang) VALUES($1, $2, $3, $4) ';

            pg.query(sql, sqlval, function(err, insert){
                console.log('storeInDbPackage', sql, sqlval, err? err : insert);
                cb(err);
            });


        } else {
            cb(err);
        }

    });

}

function zipPackage(fileName, tempDir, langs, images, cb){
    console.log('zipPackage', fileName, langs, images);

    //var output = fs.createWriteStream(__dirname + '/example-output2.zip');
    var output = fs.createWriteStream(fileName);
    var archive = Archiver('zip');

    output.on('close', function() {
        console.log('archiver has been finalized and the output file descriptor has closed.');
        cb(null, fileName);
    });

    archive.on('error', function(err) {
        throw err;
    });

    archive.pipe(output);

    images.forEach(function(img){
        var imgName = module.exports.DIR_IMG +  img;
        archive.append(fs.createReadStream(tempDir + imgName), { name: imgName });
    });

    langs.forEach(function(lng){
        var langName = module.exports.DIR_LANG + lng + module.exports.LANG_EXT;
        archive.append(fs.createReadStream(tempDir +  langName), { name:  langName });
    });


    archive.finalize(function(err, bytes) {
        if (err) {
            throw err;
        }

        console.log(bytes + ' total bytes');
    });
}


module.exports.createPkgDirectory = function(dirWhere, cb){
    fs.mkdir(dirWhere, function(){
        fs.mkdirSync(dirWhere + module.exports.DIR_LANG);
        fs.mkdirSync(dirWhere + module.exports.DIR_IMG);
        cb();
    });

}

// stolen from :
// http://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
function copyFile(source, target, cb) {
    var cbCalled = false;
    console.log('copy : ', source, ' -> ', target);

    var rd = fs.createReadStream(source);
    rd.on("error", function(err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function(err) {
        done(err);
    });
    wr.on("close", function(ex) {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
}

function getLanguagesFromMask(mask, langs){
    var res = [];

    langs.forEach(function(val, idx){
        var l = (1 << (val.lang));

        console.log('getLanguagesFromMask', mask, l, val.lang);
        if(mask & l){
            res.push(val.code);
        }
    });

    return res;
}

function loadLangs(pg, cb){
    var sql = 'SELECT ascii(lang) as lang, code FROM t_lang';

    pg.query(sql, function(err, data){
        console.log(sql , err, data.rows);
        cb(err, data ? data.rows : null);
    });
}